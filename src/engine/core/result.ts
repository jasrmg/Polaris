/**
 * Shared result shape for every engine operation.
 * `core` has no Azure types. See docs/SIMULATOR.md section 4.1.
 */

export interface EngineError {
  code: string;
  message: string;
  target?: string;
  details?: EngineError[];
  step: string;
  /** Learn page this rule comes from, when the rule is documented. */
  learnUrl?: string;
}

export interface TraceLine {
  step: string;
  ok: boolean;
  detail?: string;
}

export interface Result<T> {
  ok: boolean;
  value?: T;
  error?: EngineError;
  trace: TraceLine[];
}

export function failure<T>(trace: TraceLine[], error: EngineError): Result<T> {
  return { ok: false, error, trace: [...trace, { step: error.step, ok: false, detail: error.code }] };
}

export function success<T>(trace: TraceLine[], value: T): Result<T> {
  return { ok: true, value, trace };
}
