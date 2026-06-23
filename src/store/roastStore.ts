import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RoastProfile } from '../types';
import {
  EngineState,
  createInitialEngineState,
  toggleAction,
  advanceToNextEvent,
  evaluatePreAlert,
} from '../engine/roastEngine';
import { alertThresholdSeconds as DEFAULT_ALERT_THRESHOLD, testOffsetSeconds } from '../data';
import { ArtisanProvider } from '../engine/artisanProvider';

const THRESHOLD_STORAGE_KEY = '@alert_threshold';
const BRIDGE_IP_STORAGE_KEY = '@bridge_ip';
const DEV_BRIDGE_IP_STORAGE_KEY = '@dev_bridge_ip';
const USE_DEV_BRIDGE_KEY = '@use_dev_bridge';
const TEMP_ALERT_MIN_F_KEY = '@temp_alert_min_f';
const TEMP_ALERT_MAX_F_KEY = '@temp_alert_max_f';
const TEMP_ALERT_PCT_KEY = '@temp_alert_pct';

interface RoastStore {
  selectedProfile: RoastProfile | null;
  engineState: EngineState | null;

  // Timer (advisory only — never a trigger)
  roastStartedAt: number | null;
  elapsedSeconds: number;
  preAlertActive: boolean;
  secondsUntilNext: number | null;

  // Settings
  alertThresholdSeconds: number;
  setAlertThreshold: (seconds: number) => void;
  loadSettings: () => Promise<void>;

  // Temperature alert (live mode)
  tempAlertMinF: number;
  tempAlertMaxF: number;
  tempAlertPct: number;
  setTempAlertMinF: (val: number) => void;
  setTempAlertMaxF: (val: number) => void;
  setTempAlertPct: (val: number) => void;

  // Artisan bridge
  bridgeIp: string;
  setBridgeIp: (ip: string) => void;
  devBridgeIp: string;
  setDevBridgeIp: (ip: string) => void;
  useDevBridge: boolean;
  setUseDevBridge: (val: boolean) => void;
  wsStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  btLive: number | null;
  etLive: number | null;
  rorLive: number | null;

  selectProfile: (profile: RoastProfile) => void;
  startRoast: () => void;
  toggleAction: (eventIndex: number, actionIndex: number) => void;
  advanceEvent: () => void;
  resetRoast: () => void;
}

let timerInterval: ReturnType<typeof setInterval> | null = null;
let bridgeDebounce: ReturnType<typeof setTimeout> | null = null;

function clearTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function connectActiveIp(state: { useDevBridge: boolean; bridgeIp: string; devBridgeIp: string }) {
  const ip = (state.useDevBridge ? state.devBridgeIp : state.bridgeIp).trim();
  if (ip) {
    artisanProvider.connect(ip);
  } else {
    artisanProvider.disconnect();
  }
}

const artisanProvider = new ArtisanProvider(
  (status) => {
    useRoastStore.setState({ wsStatus: status });
    if (status === 'disconnected' || status === 'error') {
      useRoastStore.setState({ btLive: null, etLive: null, rorLive: null });
    }
  },
  (bt, et, ror, artisanElapsed) => {
    // Update live values immediately on every frame, even before roast timer starts
    const update: Record<string, unknown> = { btLive: bt, etLive: et, rorLive: ror };
    // Use Artisan's elapsed time when available (primary timer source)
    if (artisanElapsed !== null && useRoastStore.getState().roastStartedAt !== null) {
      update.elapsedSeconds = artisanElapsed;
    }
    useRoastStore.setState(update);
  },
);

export const useRoastStore = create<RoastStore>((set, get) => ({
  selectedProfile: null,
  engineState: null,
  roastStartedAt: null,
  elapsedSeconds: 0,
  preAlertActive: false,
  secondsUntilNext: null,
  alertThresholdSeconds: DEFAULT_ALERT_THRESHOLD,
  setAlertThreshold: (seconds) => {
    set({ alertThresholdSeconds: seconds });
    AsyncStorage.setItem(THRESHOLD_STORAGE_KEY, String(seconds));
  },

  tempAlertMinF: 3,
  tempAlertMaxF: 15,
  tempAlertPct: 30,
  setTempAlertMinF: (val) => {
    set({ tempAlertMinF: val });
    AsyncStorage.setItem(TEMP_ALERT_MIN_F_KEY, String(val));
  },
  setTempAlertMaxF: (val) => {
    set({ tempAlertMaxF: val });
    AsyncStorage.setItem(TEMP_ALERT_MAX_F_KEY, String(val));
  },
  setTempAlertPct: (val) => {
    set({ tempAlertPct: val });
    AsyncStorage.setItem(TEMP_ALERT_PCT_KEY, String(val));
  },

  bridgeIp: '',
  devBridgeIp: '',
  useDevBridge: false,
  setBridgeIp: (ip) => {
    set({ bridgeIp: ip });
    if (bridgeDebounce) clearTimeout(bridgeDebounce);
    bridgeDebounce = setTimeout(() => {
      AsyncStorage.setItem(BRIDGE_IP_STORAGE_KEY, ip);
      // Only reconnect if this is the active source
      if (!get().useDevBridge) connectActiveIp(get());
    }, 800);
  },
  setDevBridgeIp: (ip) => {
    set({ devBridgeIp: ip });
    if (bridgeDebounce) clearTimeout(bridgeDebounce);
    bridgeDebounce = setTimeout(() => {
      AsyncStorage.setItem(DEV_BRIDGE_IP_STORAGE_KEY, ip);
      if (get().useDevBridge) connectActiveIp(get());
    }, 800);
  },
  setUseDevBridge: (val) => {
    set({ useDevBridge: val });
    AsyncStorage.setItem(USE_DEV_BRIDGE_KEY, val ? '1' : '0');
    connectActiveIp(get());
  },
  wsStatus: 'disconnected',
  btLive: null,
  etLive: null,
  rorLive: null,
  loadSettings: async () => {
    const [thresholdVal, bridgeIpVal, devBridgeIpVal, useDevVal, minFVal, maxFVal, pctVal] = await Promise.all([
      AsyncStorage.getItem(THRESHOLD_STORAGE_KEY),
      AsyncStorage.getItem(BRIDGE_IP_STORAGE_KEY),
      AsyncStorage.getItem(DEV_BRIDGE_IP_STORAGE_KEY),
      AsyncStorage.getItem(USE_DEV_BRIDGE_KEY),
      AsyncStorage.getItem(TEMP_ALERT_MIN_F_KEY),
      AsyncStorage.getItem(TEMP_ALERT_MAX_F_KEY),
      AsyncStorage.getItem(TEMP_ALERT_PCT_KEY),
    ]);
    if (thresholdVal !== null) {
      const parsed = parseInt(thresholdVal, 10);
      if (!isNaN(parsed)) set({ alertThresholdSeconds: parsed });
    }
    if (minFVal !== null) {
      const parsed = parseInt(minFVal, 10);
      if (!isNaN(parsed)) set({ tempAlertMinF: parsed });
    }
    if (maxFVal !== null) {
      const parsed = parseInt(maxFVal, 10);
      if (!isNaN(parsed)) set({ tempAlertMaxF: parsed });
    }
    if (pctVal !== null) {
      const parsed = parseInt(pctVal, 10);
      if (!isNaN(parsed)) set({ tempAlertPct: parsed });
    }
    const useDev = useDevVal === '1';
    if (bridgeIpVal !== null) set({ bridgeIp: bridgeIpVal });
    if (devBridgeIpVal !== null) set({ devBridgeIp: devBridgeIpVal });
    set({ useDevBridge: useDev });
    connectActiveIp({ useDevBridge: useDev, bridgeIp: bridgeIpVal ?? '', devBridgeIp: devBridgeIpVal ?? '' });
  },

  selectProfile: (profile) => {
    clearTimer();
    set({ selectedProfile: profile, engineState: null, roastStartedAt: null, elapsedSeconds: 0, preAlertActive: false, secondsUntilNext: null });
  },

  startRoast: () => {
    const { selectedProfile } = get();
    if (!selectedProfile) return;
    set({ engineState: createInitialEngineState(selectedProfile) });
  },

  toggleAction: (eventIndex, actionIndex) => {
    const { engineState } = get();
    if (!engineState) return;
    set({ engineState: toggleAction(engineState, eventIndex, actionIndex) });
  },

  advanceEvent: () => {
    const { selectedProfile, engineState, roastStartedAt } = get();
    if (!selectedProfile || !engineState) return;

    const newEngineState = advanceToNextEvent(engineState, selectedProfile);

    // Start timer when Charge is confirmed (index 1), matching Artisan's convention
    // of resetting the clock at charge. Step 0 (preheat) has no running timer.
    if (engineState.currentEventIndex === 1 && roastStartedAt === null) {
      const now = Date.now() - testOffsetSeconds * 1000;
      clearTimer();
      timerInterval = setInterval(() => {
        const { engineState: es, roastStartedAt: startedAt, alertThresholdSeconds: threshold } = get();
        if (!startedAt) return;

        // Prefer Artisan's elapsed time (from WebLCD); fall back to local timer
        const artisanElapsed = artisanProvider.getElapsedSeconds();
        const localElapsed = Math.floor((Date.now() - startedAt) / 1000);
        const elapsed = artisanElapsed ?? localElapsed;

        const { preAlertActive, secondsUntilNext } = evaluatePreAlert(
          elapsed,
          es?.currentEvent ?? null,
          threshold,
        );

        // Read live temperature from ArtisanProvider (display + alerts only)
        // Engine never auto-advances — user must confirm every step.
        const bt = artisanProvider.getBT();
        const et = artisanProvider.getET();
        const ror = artisanProvider.getRoR();

        set({
          elapsedSeconds: elapsed,
          preAlertActive,
          secondsUntilNext,
          btLive: bt,
          etLive: et,
          rorLive: ror,
        });
      }, 1000);
      set({ engineState: newEngineState, roastStartedAt: now, preAlertActive: false, secondsUntilNext: null });
      return;
    }

    // Clear pre-alert immediately on advance so banner doesn't linger
    set({ engineState: newEngineState, preAlertActive: false, secondsUntilNext: null });

    if (newEngineState.isComplete) clearTimer();
  },

  resetRoast: () => {
    clearTimer();
    set({ selectedProfile: null, engineState: null, roastStartedAt: null, elapsedSeconds: 0, preAlertActive: false, secondsUntilNext: null, btLive: null, etLive: null, rorLive: null });
  },
}));
