import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { useRoastStore } from '../store/roastStore';
import { PHASE_COLORS, PHASE_TEXT_COLORS, PHASE_LABELS } from '../utils/phaseColors';
import { ActionEvent, InfoEvent, RoastProfile } from '../types';
import { areActionsComplete, EngineState } from '../engine/roastEngine';
import { formatTime } from '../utils/formatTime';
import { RootStackParamList } from '../../App';
import { useSoundPreference, SOUND_OPTIONS } from '../hooks/useSoundPreference';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Roast'>;
};

/** Extract current gas level from completed actions up to (and including) current step */
function deriveGasLevel(profile: RoastProfile, engineState: EngineState): string | null {
  let gas: string | null = null;
  for (let i = 0; i <= engineState.currentEventIndex; i++) {
    const ev = profile.events[i];
    if (ev.type !== 'action') continue;
    const actions = (ev as ActionEvent).actions;
    // For past events, all actions are implicitly done; for current event, check completedActions
    const isCurrent = i === engineState.currentEventIndex;
    for (let j = 0; j < actions.length; j++) {
      const done = isCurrent ? (engineState.completedActions[ev.index]?.[j] ?? false) : true;
      if (!done) continue;
      const match = actions[j].match(/Gas\s+(OFF|\d+)/i);
      if (match) gas = match[1].toUpperCase() === 'OFF' ? '0' : match[1];
    }
  }
  return gas;
}

/** Extract current air position from completed actions. Returns symbol: I, /, -- */
function deriveAirSymbol(profile: RoastProfile, engineState: EngineState): string {
  let air = 'I'; // default A0 — cooling bin
  for (let i = 0; i <= engineState.currentEventIndex; i++) {
    const ev = profile.events[i];
    if (ev.type !== 'action') continue;
    const actions = (ev as ActionEvent).actions;
    const isCurrent = i === engineState.currentEventIndex;
    for (let j = 0; j < actions.length; j++) {
      const done = isCurrent ? (engineState.completedActions[ev.index]?.[j] ?? false) : true;
      if (!done) continue;
      const a = actions[j];
      if (/Air 100%|A2/i.test(a)) air = '--';
      else if (/Air 1|50\/50|A1/i.test(a)) air = '⟋';
    }
  }
  return air;
}

export default function RoastScreen({ navigation }: Props) {
  const { currentOption } = useSoundPreference();
  const engineState     = useRoastStore(s => s.engineState);
  const selectedProfile = useRoastStore(s => s.selectedProfile);
  const toggleAction    = useRoastStore(s => s.toggleAction);
  const advanceEvent    = useRoastStore(s => s.advanceEvent);
  const resetRoast      = useRoastStore(s => s.resetRoast);
  const elapsedSeconds  = useRoastStore(s => s.elapsedSeconds);
  const roastStartedAt  = useRoastStore(s => s.roastStartedAt);
  const preAlertActive  = useRoastStore(s => s.preAlertActive);
  const btLive          = useRoastStore(s => s.btLive);
  const rorLive         = useRoastStore(s => s.rorLive);
  const wsStatus        = useRoastStore(s => s.wsStatus);
  const bridgeIp        = useRoastStore(s => s.bridgeIp);
  const devBridgeIp     = useRoastStore(s => s.devBridgeIp);
  const useDevBridge    = useRoastStore(s => s.useDevBridge);
  const tempAlertMinF   = useRoastStore(s => s.tempAlertMinF);
  const tempAlertMaxF   = useRoastStore(s => s.tempAlertMaxF);
  const tempAlertPct    = useRoastStore(s => s.tempAlertPct);
  const isLive = btLive !== null && wsStatus === 'connected';
  const activeIp = useDevBridge ? devBridgeIp : bridgeIp;
  const showManualWarning = activeIp.trim() !== '' && wsStatus !== 'connected' && wsStatus !== 'connecting';

  // Derived timer values
  const currentEst = engineState?.currentEvent?.estimated_time_seconds ?? null;
  const isOverdue = roastStartedAt !== null && currentEst !== null && elapsedSeconds > currentEst;

  const timerDisplay = roastStartedAt !== null ? formatTime(elapsedSeconds) : null;
  const timeRemaining = roastStartedAt !== null && currentEst !== null
    ? currentEst - elapsedSeconds : null;
  const timeRemainingDisplay = timeRemaining !== null
    ? (timeRemaining < 0 ? `-${formatTime(Math.abs(timeRemaining))}` : formatTime(timeRemaining))
    : '--:--';

  // Current event's target temp (what we need to be at for this step)
  const currentTriggerTemp = engineState?.currentEvent?.trigger.temperature ?? null;
  // Next event's target temp (what we're heading towards)
  const nextTriggerTemp = engineState?.nextEvent?.trigger.temperature ?? null;

  // Effective target: what BT is climbing towards right now
  const isRising = rorLive !== null && rorLive > 0;

  // Latch: once BT rises to the trigger from below, the button stays unlocked.
  const tempReachedRef = useRef(false);
  const seenBelowRef = useRef(false);
  const stepIndexRef = useRef(engineState?.currentEventIndex ?? -1);
  if (engineState && engineState.currentEventIndex !== stepIndexRef.current) {
    stepIndexRef.current = engineState.currentEventIndex;
    tempReachedRef.current = false;
    seenBelowRef.current = false;
  }
  if (btLive !== null && currentTriggerTemp !== null && btLive < currentTriggerTemp) {
    seenBelowRef.current = true;
  }
  if (seenBelowRef.current && isRising && btLive !== null && currentTriggerTemp !== null && btLive >= currentTriggerTemp - 2) {
    tempReachedRef.current = true;
  }
  const tempReachedLatched = tempReachedRef.current;
  const { effectiveTarget, effectiveGap, effectiveTargetEst } = (() => {
    if (!isLive || btLive === null || !isRising) return { effectiveTarget: null, effectiveGap: null, effectiveTargetEst: null };

    if (currentTriggerTemp !== null && btLive < currentTriggerTemp) {
      const prevIndex = (engineState?.currentEventIndex ?? 1) - 1;
      const prevTrigger = prevIndex >= 0
        ? selectedProfile?.events[prevIndex]?.trigger.temperature ?? null : null;
      const gap = prevTrigger !== null && currentTriggerTemp > prevTrigger
        ? currentTriggerTemp - prevTrigger : null;
      const est = engineState?.currentEvent?.estimated_time_seconds ?? null;
      return { effectiveTarget: currentTriggerTemp, effectiveGap: gap, effectiveTargetEst: est };
    }

    if (nextTriggerTemp !== null && nextTriggerTemp > btLive) {
      const gap = currentTriggerTemp !== null && nextTriggerTemp > currentTriggerTemp
        ? nextTriggerTemp - currentTriggerTemp : null;
      const est = engineState?.nextEvent?.estimated_time_seconds ?? null;
      return { effectiveTarget: nextTriggerTemp, effectiveGap: gap, effectiveTargetEst: est };
    }

    return { effectiveTarget: null, effectiveGap: null, effectiveTargetEst: null };
  })();

  // ETA to effective target
  const MIN_ROR_FOR_ETA = 5;
  const etaSeconds: number | null = (() => {
    if (!isLive || btLive === null || effectiveTarget === null) return null;
    const delta = effectiveTarget - btLive;
    if (delta <= 0) return 0;
    const rorEta = (rorLive !== null && rorLive >= MIN_ROR_FOR_ETA)
      ? Math.round((delta / rorLive) * 60) : null;
    const timeEta = (effectiveTargetEst !== null && roastStartedAt !== null)
      ? Math.max(0, effectiveTargetEst - elapsedSeconds) : null;
    if (rorEta !== null && timeEta !== null) return Math.min(rorEta, timeEta);
    return rorEta ?? timeEta;
  })();

  // Temperature approach alert
  const tempAlertThreshold = (effectiveGap !== null && effectiveGap > 0)
    ? Math.min(tempAlertMaxF, Math.max(tempAlertMinF, Math.round(effectiveGap * tempAlertPct / 100)))
    : tempAlertMinF;
  const degreesToTarget = (effectiveTarget !== null && btLive !== null)
    ? effectiveTarget - btLive : null;
  const tempApproaching = isRising && degreesToTarget !== null && degreesToTarget > 0 && degreesToTarget <= tempAlertThreshold;
  const btReached = isRising && degreesToTarget !== null && degreesToTarget <= 2 && degreesToTarget >= -2;

  // Critical step detection (Charge/Drop)
  const isCriticalStep = engineState?.currentEvent?.type === 'action' &&
    (engineState.currentEvent as ActionEvent).actions.some(a => /charge|drop/i.test(a));

  const shouldPulse = (tempApproaching && !btReached) || isCriticalStep;
  const targetPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (shouldPulse) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(targetPulse, { toValue: 0.5, duration: 1200, useNativeDriver: true }),
          Animated.timing(targetPulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      targetPulse.setValue(1);
    }
  }, [shouldPulse]);

  // Critical alert: loud sound at 400°F for Charge
  const CRITICAL_TEMP = 400;
  const isChargeNext = (() => {
    if (!selectedProfile || !engineState) return false;
    const nextIdx = engineState.currentEventIndex + 1;
    const targetEvent = (currentTriggerTemp !== null && btLive !== null && btLive < currentTriggerTemp)
      ? engineState.currentEvent
      : (nextIdx < selectedProfile.events.length ? selectedProfile.events[nextIdx] : null);
    if (!targetEvent || targetEvent.type !== 'action') return false;
    return (targetEvent as ActionEvent).actions.some(a => a.toLowerCase().includes('charge'));
  })();
  const criticalAlert = isLive && isChargeNext && isRising && btLive !== null && btLive >= CRITICAL_TEMP && btLive < (effectiveTarget ?? Infinity);

  // Action overdue
  const actionOverdue = isLive && isRising && btLive !== null && currentTriggerTemp !== null
    && btLive >= currentTriggerTemp + 5
    && engineState !== null && engineState.currentEvent !== null && engineState.currentEvent.type === 'action'
    && !areActionsComplete(engineState, engineState.currentEvent.index);

  const shouldBlink = isOverdue || preAlertActive || tempApproaching || criticalAlert || actionOverdue;

  const blinkAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (shouldBlink) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.15, duration: 500, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      blinkAnim.setValue(1);
    }
  }, [shouldBlink]);

  // Play a sound file helper
  const playSound = useRef((soundRequire: number) => {
    Audio.Sound.createAsync(soundRequire, { shouldPlay: true, volume: 1.0 })
      .then(({ sound }) => {
        sound.setOnPlaybackStatusUpdate(status => {
          if ('didJustFinish' in status && status.didJustFinish) sound.unloadAsync();
        });
      }).catch(() => {/* silent fail */});
  }).current;

  // Three-phase temperature alert
  const HAPTIC_STEP_F = 0.5;
  const COUNTDOWN_DEGREES = [3, 2, 1];

  const entryFiredRef = useRef(false);
  const lastHapticBtRef = useRef<number | null>(null);
  const countdownFiredRef = useRef<Set<number>>(new Set());
  const prevTargetRef = useRef<number | null>(null);

  if (effectiveTarget !== prevTargetRef.current) {
    prevTargetRef.current = effectiveTarget;
    entryFiredRef.current = false;
    lastHapticBtRef.current = null;
    countdownFiredRef.current = new Set();
  }

  useEffect(() => {
    if (!tempApproaching || btLive === null || degreesToTarget === null) return;

    if (!entryFiredRef.current) {
      entryFiredRef.current = true;
      lastHapticBtRef.current = btLive;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (currentOption.require !== null) playSound(currentOption.require);
      return;
    }

    for (const deg of COUNTDOWN_DEGREES) {
      if (degreesToTarget <= deg && !countdownFiredRef.current.has(deg)) {
        countdownFiredRef.current.add(deg);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        if (currentOption.require !== null) playSound(currentOption.require);
        lastHapticBtRef.current = btLive;
        return;
      }
    }

    if (lastHapticBtRef.current !== null && btLive - lastHapticBtRef.current >= HAPTIC_STEP_F) {
      lastHapticBtRef.current = btLive;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [btLive]);

  // Critical alert sound
  const criticalFiredRef = useRef(false);
  const criticalSoundRequire = SOUND_OPTIONS.find(o => o.key === 'alert')?.require ?? null;
  useEffect(() => {
    if (criticalAlert && !criticalFiredRef.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (criticalSoundRequire !== null) playSound(criticalSoundRequire);
      criticalFiredRef.current = true;
    }
    if (!isChargeNext) criticalFiredRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criticalAlert, isChargeNext]);

  if (!engineState || !selectedProfile) return null;

  const { currentEvent, nextEvent, completedActions, isComplete } = engineState;
  const phase = currentEvent?.phase ?? 'preheat';
  const phaseColor = PHASE_COLORS[phase];
  const phaseTextColor = PHASE_TEXT_COLORS[phase];

  const actionEvents = selectedProfile.events.filter(e => e.type === 'action');
  const totalSteps   = actionEvents.length;
  const isInfoEvent  = currentEvent?.type === 'info';
  const actionStepNumber = currentEvent
    ? selectedProfile.events.slice(0, (currentEvent.index ?? 0) + 1).filter(e => e.type === 'action').length
    : 0;
  const infoNumber = currentEvent
    ? selectedProfile.events.slice(0, (currentEvent.index ?? 0) + 1).filter(e => e.type === 'info').length
    : 0;
  const stepLabel = isInfoEvent ? `Info ${infoNumber}` : `${actionStepNumber}/${totalSteps}`;

  // Derive current gas/air state from profile history
  const gasLevel = deriveGasLevel(selectedProfile, engineState);
  const airSymbol = deriveAirSymbol(selectedProfile, engineState);

  // Pending acknowledgments
  const pendingAcks: number[] = [];
  for (let i = 0; i < engineState.currentEventIndex; i++) {
    const ev = selectedProfile.events[i];
    if (ev.type === 'action' && !areActionsComplete(engineState, ev.index)) {
      pendingAcks.push(ev.index);
    }
  }

  const profileShort = (selectedProfile.name ?? '').slice(0, 10);
  const currentTargetTemp = currentEvent?.trigger.temperature ?? null;
  const currentSource = currentEvent?.trigger.source ?? 'ART';

  // Display target: show effective target when approaching, else current trigger
  const displayTarget = effectiveTarget ?? currentTriggerTemp;
  const displaySource = currentSource;

  function handleExit() {
    resetRoast();
    navigation.goBack();
  }

  return (
    <SafeAreaView style={s.container}>

      {/* ─── Phase header ─── */}
      <View style={[s.phaseHeader, { backgroundColor: phaseColor }]}>
        <Text style={[s.phaseLabel, { color: phaseTextColor }]}>
          {PHASE_LABELS[phase]}
        </Text>
        {isLive ? (
          <Text style={s.modeLive}>LIVE</Text>
        ) : showManualWarning ? (
          <Text style={s.modeManual}>MANUAL</Text>
        ) : null}
        <Text style={[s.profileName, { color: phaseTextColor }]}>
          {profileShort}
        </Text>
      </View>

      {/* ─── LCD Dashboard: two columns — fills ~2/3 of screen ─── */}
      <View style={s.dashboard}>

        {/* Left column — current state, then target */}
        <View style={s.dashLeft}>
          <View>
            <Text style={s.sectionLabel}>CURRENT STATE</Text>
            <View style={s.gasAirRow}>
              <View style={s.gasCard}>
                <Text style={s.gasAirLabel}>GAS</Text>
                <Text style={[s.gasValue, gasLevel === '0' && { color: '#555' }]}>
                  {gasLevel !== null ? (gasLevel === '0' ? 'OFF' : gasLevel) : '--'}
                </Text>
              </View>
              <View style={s.airCard}>
                <Text style={s.gasAirLabel}>AIR</Text>
                <Text style={s.airValue}>{airSymbol}</Text>
              </View>
            </View>
          </View>

          <Animated.View style={[
            s.targetCard,
            tempApproaching && !btReached && { borderColor: '#FFB347', opacity: targetPulse },
            btReached && { borderColor: '#5B9A6A' },
          ]}>
            <Text style={s.targetLabel}>{displaySource} TARGET</Text>
            <View style={s.targetRow}>
              <Animated.Text style={[
                s.targetTemp,
                tempApproaching && !btReached && { color: '#FFB347' },
                btReached && { color: '#5B9A6A' },
              ]}>
                {displayTarget !== null ? `${displayTarget}` : '---'}
              </Animated.Text>
              <Text style={[
                s.targetUnit,
                tempApproaching && !btReached && { color: '#FFB347' },
                btReached && { color: '#5B9A6A' },
              ]}>°F</Text>
            </View>
          </Animated.View>

          {/* Time remaining box */}
          <Animated.View style={[
            s.remainingCard,
            isOverdue && { borderColor: '#E74C3C' },
          ]}>
            <Text style={s.remainingLabel}>REMAINING</Text>
            <Animated.Text style={[
              s.remainingValue,
              isOverdue && { color: '#E74C3C', opacity: blinkAnim },
            ]}>
              {timeRemainingDisplay}
            </Animated.Text>
          </Animated.View>
        </View>

        {/* Right column — Artisan-style LCD cards */}
        <View style={s.dashRight}>

          {/* Header + Timer — aligned with Current State + gas/air row */}
          <View>
            <Text style={[s.sectionLabel, { textAlign: 'center' }]}>ARTISAN</Text>
            <View style={s.lcdCard}>
              <Text style={s.lcdLabel}>Timer</Text>
              <Text style={s.lcdTime}>
                {timerDisplay ?? '--:--'}
              </Text>
            </View>
          </View>

          {/* BT card — prominent, like Artisan's main LCD */}
          {isLive ? (
            <Animated.View style={[
              s.lcdCardBT,
              { opacity: (tempApproaching && !btReached) ? blinkAnim : 1 },
              tempApproaching && !btReached && { borderColor: '#FFB347' },
              btReached && { borderColor: '#5B9A6A', backgroundColor: '#0A1A0F' },
            ]}>
              <Text style={s.lcdLabel}>BT</Text>
              <Animated.Text style={[
                s.lcdBT,
                tempApproaching && !btReached && { color: '#FFB347' },
                btReached && { color: '#5B9A6A' },
              ]}>
                {btLive!.toFixed(1)}
              </Animated.Text>
            </Animated.View>
          ) : (
            <View style={[s.lcdCardBT, { borderColor: '#222' }]}>
              <Text style={s.lcdLabel}>BT</Text>
              <Text style={[s.lcdBT, { color: '#444' }]}>
                {currentTargetTemp !== null ? `${currentTargetTemp}.0` : '---.-'}
              </Text>
            </View>
          )}

          {/* Delta BT (RoR) card */}
          <View style={s.lcdCardSlim}>
            <Text style={s.lcdLabel}>ΔBT</Text>
            {isLive && rorLive !== null ? (
              <View style={s.rorRow}>
                <Text style={[s.rorArrow, rorLive > 0 ? s.rorUp : s.rorDown]}>
                  {rorLive > 0 ? '▲' : '▼'}
                </Text>
                <Text style={[s.lcdRoR, rorLive > 0 ? s.rorUp : s.rorDown]}>
                  {Math.abs(Math.round(rorLive))}
                </Text>
                <Text style={s.rorUnit}>°/m</Text>
              </View>
            ) : (
              <Text style={[s.lcdRoR, { color: '#333' }]}>--</Text>
            )}
          </View>
        </View>
      </View>

      {/* ─── Bottom third: actions, next, exit ─── */}
      <ScrollView style={s.scrollOuter} contentContainerStyle={s.scroll}>

        {/* Current event actions */}
        {currentEvent && !isComplete && currentEvent.type === 'action' && (
          <View style={s.actionCard}>
            <Text style={s.stepCounter}>{stepLabel}</Text>
            {(currentEvent as ActionEvent).actions.map((action, i) => {
              const done = completedActions[currentEvent.index]?.[i] ?? false;
              if (done) return null;
              const isPreheat = engineState.currentEventIndex === 0;
              const canTap = !isLive || isPreheat || tempReachedLatched;
              const overdue = canTap && isLive && isRising && btLive !== null && currentTriggerTemp !== null && btLive >= currentTriggerTemp + 5;
              return (
                <Animated.View key={i} style={overdue ? { opacity: blinkAnim } : undefined}>
                  <TouchableOpacity
                    style={[
                      s.actionBtn,
                      !canTap && s.actionBtnLocked,
                      canTap && !overdue && s.actionBtnReady,
                      overdue && s.actionBtnOverdue,
                    ]}
                    onPress={() => {
                      if (!canTap) return;
                      toggleAction(currentEvent.index, i);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      const actions = (currentEvent as ActionEvent).actions;
                      const allOthersDone = actions.every((_, j) =>
                        j === i || (completedActions[currentEvent.index]?.[j] ?? false)
                      );
                      if (allOthersDone) setTimeout(() => advanceEvent(), 0);
                    }}
                  >
                    <Text style={[s.actionBtnText, !canTap && s.actionBtnTextLocked]}>
                      {action}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
            {(currentEvent as ActionEvent).notes?.map((note, i) => (
              <Text key={i} style={s.noteText}>ℹ {note}</Text>
            ))}
          </View>
        )}

        {/* Info event */}
        {currentEvent && !isComplete && currentEvent.type === 'info' && (
          <View style={s.actionCard}>
            {(currentEvent as InfoEvent).info.map((line, i) => (
              <Text key={i} style={s.infoText}>• {line}</Text>
            ))}
            <TouchableOpacity style={s.nextBtn} onPress={advanceEvent}>
              <Text style={s.nextBtnText}>Next →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Roast complete */}
        {isComplete && (
          <View style={s.completeCard}>
            <Text style={s.completeEmoji}>☕</Text>
            <Text style={s.completeText}>Roast complete!</Text>
          </View>
        )}

        {/* Next event preview */}
        {nextEvent && !isComplete && (
          <View style={s.nextCard}>
            <Text style={s.nextCardLabel}>UP NEXT</Text>
            <View style={s.nextCardRow}>
              <Text style={s.nextCardTemp}>
                {nextEvent.trigger.temperature}°F
              </Text>
              <Text style={s.nextCardSource}>{nextEvent.trigger.source}</Text>
              <Text style={s.nextCardActions}>
                {nextEvent.type === 'action'
                  ? (nextEvent as ActionEvent).actions.join('  ·  ')
                  : (nextEvent as InfoEvent).info[0]}
              </Text>
            </View>
          </View>
        )}

        {/* Pending acks */}
        {pendingAcks.length > 0 && (
          <Animated.View style={[s.pendingCard, { opacity: blinkAnim }]}>
            <Text style={s.pendingTitle}>Confirm previous:</Text>
            {pendingAcks.map(evIdx => {
              const ev = selectedProfile.events.find(e => e.index === evIdx);
              if (!ev || ev.type !== 'action') return null;
              return (ev as ActionEvent).actions.map((action, i) => {
                const done = completedActions[evIdx]?.[i] ?? false;
                if (done) return null;
                return (
                  <TouchableOpacity
                    key={`${evIdx}-${i}`}
                    style={[s.actionBtn, s.actionBtnOverdue]}
                    onPress={() => {
                      toggleAction(evIdx, i);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }}
                  >
                    <Text style={s.actionBtnText}>{action}</Text>
                  </TouchableOpacity>
                );
              });
            })}
          </Animated.View>
        )}

        <TouchableOpacity style={s.exitBtn} onPress={handleExit}>
          <Text style={s.exitBtnText}>Exit Roast</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },

  /* ─── Phase header ─── */
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  phaseLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    width: 90,
  },
  profileName: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.8,
    textAlign: 'right',
    width: 90,
  },
  modeLive: {
    color: '#2ECC71',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  modeManual: {
    color: '#E67E22',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  /* ─── Dashboard — fills ~2/3 of screen ─── */
  dashboard: {
    flexDirection: 'row',
    backgroundColor: '#0E0E0E',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },

  /* Left column — target + gas/air */
  dashLeft: {
    flex: 1,
    padding: 16,
    paddingTop: 12,
    borderRightWidth: 1,
    borderRightColor: '#2A2A2A',
  },
  targetCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 14,
    marginTop: 10,
    height: 80,
    justifyContent: 'center',
  },
  targetLabel: {
    color: '#666',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  targetTemp: {
    color: '#CCC',
    fontSize: 34,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  targetUnit: {
    color: '#555',
    fontSize: 15,
    fontWeight: '400',
    marginLeft: 2,
  },
  etaLabel: {
    color: '#777',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },

  sectionLabel: {
    color: '#555',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  gasAirRow: {
    flexDirection: 'row',
    gap: 8,
  },
  gasCard: {
    flex: 1,
    backgroundColor: '#161616',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingVertical: 6,
    alignItems: 'center',
  },
  airCard: {
    flex: 1,
    backgroundColor: '#161616',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingVertical: 6,
    alignItems: 'center',
  },
  gasAirLabel: {
    color: '#555',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  gasValue: {
    color: '#4DA6FF',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 1,
  },
  airValue: {
    color: '#4DA6FF',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 1,
  },
  remainingCard: {
    backgroundColor: '#161616',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 12,
    marginTop: 8,
    height: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  remainingLabel: {
    color: '#555',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  remainingValue: {
    color: '#AAA',
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  stepCounter: {
    color: '#555',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },

  /* Right column — Artisan-style LCD cards */
  dashRight: {
    flex: 1,
    padding: 10,
    paddingTop: 12,
    gap: 10,
  },
  lcdCard: {
    backgroundColor: '#141414',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#222',
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'flex-end',
  },
  lcdCardSlim: {
    backgroundColor: '#141414',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#222',
    paddingHorizontal: 12,
    height: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lcdCardBT: {
    backgroundColor: '#0A1018',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#1A3050',
    paddingHorizontal: 14,
    height: 80,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  lcdLabel: {
    color: '#555',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textAlign: 'right',
  },
  lcdTime: {
    color: '#4DA6FF',
    fontSize: 22,
    fontFamily: 'DSEG7',
    textAlign: 'right',
    marginTop: 2,
  },
  lcdBT: {
    color: '#FFF',
    fontSize: 34,
    fontFamily: 'DSEG7',
    textAlign: 'right',
  },
  lcdRoR: {
    fontSize: 16,
    fontFamily: 'DSEG7',
    textAlign: 'right',
  },
  rorRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    gap: 4,
  },
  rorArrow: {
    fontSize: 12,
    fontWeight: '700',
  },
  rorUnit: {
    color: '#444',
    fontSize: 11,
    fontWeight: '600',
  },
  rorUp: { color: '#FF6B6B' },
  rorDown: { color: '#4DA6FF' },

  /* ─── Bottom section: scrollable ─── */
  scrollOuter: { flex: 1 },
  scroll: { padding: 12, gap: 10 },

  actionCard: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#1E1E1E',
  },
  actionBtn: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#333',
    backgroundColor: '#1A1A1A',
  },
  actionBtnLocked: {
    borderColor: '#E67E22',
    backgroundColor: '#1A1400',
    opacity: 0.6,
  },
  actionBtnReady: {
    borderColor: '#5B9A6A',
    backgroundColor: '#0F1A12',
  },
  actionBtnOverdue: {
    borderColor: '#E74C3C',
    backgroundColor: '#1F0A0A',
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  actionBtnTextLocked: {
    color: '#888',
  },

  noteText: { color: '#888', fontSize: 12, fontStyle: 'italic' },
  infoText: { color: '#FFF', fontSize: 15, lineHeight: 22 },

  nextBtn: {
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 2,
  },
  nextBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },

  nextCard: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    opacity: 0.45,
  },
  nextCardLabel: {
    color: '#444',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  nextCardRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    flexWrap: 'wrap',
  },
  nextCardTemp: {
    color: '#888',
    fontSize: 14,
    fontWeight: '700',
  },
  nextCardSource: {
    color: '#555',
    fontSize: 11,
    fontWeight: '600',
  },
  nextCardActions: {
    color: '#555',
    fontSize: 12,
    flex: 1,
  },

  pendingCard: {
    backgroundColor: '#1F0A0A',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E74C3C',
    gap: 8,
  },
  pendingTitle: {
    color: '#E74C3C',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  completeCard: {
    backgroundColor: '#1E3A1E',
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    gap: 10,
  },
  completeEmoji: { fontSize: 40 },
  completeText: { color: '#4ADE80', fontSize: 22, fontWeight: '700' },

  exitBtn: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    alignItems: 'center',
  },
  exitBtnText: { color: '#333', fontSize: 13 },
});
