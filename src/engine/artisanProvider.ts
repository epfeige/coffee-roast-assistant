import { TemperatureProvider } from './temperatureProvider';

type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

type StatusCallback = (status: WsStatus) => void;
type FrameCallback = (bt: number | null, et: number | null, ror: number | null, elapsedSeconds: number | null) => void;

const RECONNECT_DELAY_MS = 3000;
const STALE_DATA_MS = 5000;

/**
 * Phase 3 provider — reads live temperature from Artisan's WebLCD WebSocket.
 *
 * Artisan's WebLCD server pushes BT/ET as display strings every sample:
 *   {"data":{"time":"05:30","bt":"385.2","et":"397.4"}}
 *
 * Connect by calling connect(ip) where ip includes the port (e.g. "10.20.40.2:8080").
 * The provider computes RoR locally from successive BT readings.
 *
 * Falls back gracefully: getBT/getET/getRoR return null when disconnected,
 * so the engine stays in manual mode until live data arrives.
 */
export class ArtisanProvider implements TemperatureProvider {
  private bt: number | null = null;
  private et: number | null = null;
  private ror: number | null = null;
  private elapsedSeconds: number | null = null;

  // RoR computation from successive BT readings
  private prevBt: number | null = null;
  private prevBtTime: number | null = null;

  private ws: WebSocket | null = null;
  private url: string | null = null;
  private active = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private onStatus: StatusCallback;
  private onFrame: FrameCallback | null = null;

  constructor(onStatus: StatusCallback, onFrame?: FrameCallback) {
    this.onStatus = onStatus;
    this.onFrame = onFrame ?? null;
  }

  getBT(): number | null { return this.bt; }
  getET(): number | null { return this.et; }
  getRoR(): number | null { return this.ror; }
  getElapsedSeconds(): number | null { return this.elapsedSeconds; }

  connect(ip: string): void {
    this.disconnect();
    // User enters "10.20.40.2:8080" — connect to Artisan's WebLCD WebSocket
    this.url = `ws://${ip}/websocket`;
    this.active = true;
    this._open();
  }

  disconnect(): void {
    this.active = false;
    this._clearReconnect();
    this._clearStaleTimer();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.bt = null;
    this.et = null;
    this.ror = null;
    this.elapsedSeconds = null;
    this.prevBt = null;
    this.prevBtTime = null;
    this.onStatus('disconnected');
  }

  private _computeRoR(bt: number): number | null {
    const now = Date.now();
    if (this.prevBt !== null && this.prevBtTime !== null) {
      const dtSec = (now - this.prevBtTime) / 1000;
      if (dtSec > 0.5) {
        // °F per minute
        const ror = ((bt - this.prevBt) / dtSec) * 60;
        this.prevBt = bt;
        this.prevBtTime = now;
        return Math.round(ror * 10) / 10;
      }
    } else {
      this.prevBt = bt;
      this.prevBtTime = now;
    }
    return null;
  }

  private _open(): void {
    if (!this.url || !this.active) return;
    this.onStatus('connecting');

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      if (ws !== this.ws) return;
      this.onStatus('connected');
    };

    ws.onmessage = (event) => {
      if (ws !== this.ws) return;
      this._clearStaleTimer();
      try {
        const msg = JSON.parse(event.data as string);
        // WebLCD format: {"data":{"time":"05:30","bt":"385.2","et":"397.4"}}
        // Field names may vary (bt/BT/Bean Temp etc.) — try common variants
        const data = msg?.data;
        if (!data) return;

        const btRaw = data.bt ?? data.BT ?? data['Bean Temp'] ?? data['bean temp'];
        const etRaw = data.et ?? data.ET ?? data['Env Temp'] ?? data['env temp'];

        const btVal = parseFloat(btRaw);
        const etVal = parseFloat(etRaw);

        // Only update if we got a valid number — keep last known value otherwise
        if (!isNaN(btVal)) this.bt = btVal;
        if (!isNaN(etVal)) this.et = etVal;

        // Parse Artisan's elapsed time (format: "MM:SS" or "H:MM:SS")
        const timeRaw = data.time ?? data.Time;
        if (typeof timeRaw === 'string' && timeRaw.includes(':')) {
          const parts = timeRaw.split(':').map(Number);
          if (parts.length === 2 && parts.every(n => !isNaN(n))) {
            this.elapsedSeconds = parts[0] * 60 + parts[1];
          } else if (parts.length === 3 && parts.every(n => !isNaN(n))) {
            this.elapsedSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
          }
        }

        if (this.bt !== null) {
          this.ror = this._computeRoR(this.bt) ?? this.ror;
        }

        this.onFrame?.(this.bt, this.et, this.ror, this.elapsedSeconds);
      } catch {
        // malformed frame — keep last known values
      }
    };

    ws.onerror = () => {
      if (ws !== this.ws) return;
      this.onStatus('error');
    };

    ws.onclose = () => {
      if (ws !== this.ws) return;
      // Keep last-known values on brief disconnects — only null them after STALE_DATA_MS
      this.prevBt = null;
      this.prevBtTime = null;
      if (this.active) {
        this.onStatus('connecting');
        this._startStaleTimer();
        this._scheduleReconnect();
      } else {
        this._clearValues();
        this.onStatus('disconnected');
      }
    };
  }

  private _scheduleReconnect(): void {
    this._clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      this._open();
    }, RECONNECT_DELAY_MS);
  }

  private _clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private _clearValues(): void {
    this.bt = null;
    this.et = null;
    this.ror = null;
    this.elapsedSeconds = null;
    this.prevBt = null;
    this.prevBtTime = null;
    this.onFrame?.(null, null, null, null);
  }

  private _startStaleTimer(): void {
    this._clearStaleTimer();
    this.staleTimer = setTimeout(() => {
      this._clearValues();
    }, STALE_DATA_MS);
  }

  private _clearStaleTimer(): void {
    if (this.staleTimer !== null) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
  }
}
