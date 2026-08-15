/**
 * Google Calendar export/import via Google Identity Services (token model).
 * Docs:
 * - https://developers.google.com/identity/oauth2/web/guides/use-token-model
 * - https://developers.google.com/calendar/api/v3/reference/events/insert
 * - https://developers.google.com/calendar/api/v3/reference/events/list
 *
 * Import is append-only: it never updates or deletes app todos, and never
 * deletes Google Calendar events.
 */

import { TodoItem } from "../types";
import { logger } from "./logger";
import { updateTodoGoogleMark } from "./todoService";

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const EXPORT_STORAGE_KEY = "kizuna_google_calendar_exports";
const CONNECTED_FLAG_KEY = "kizuna_google_calendar_connected";
const TOKEN_CACHE_KEY = "kizuna_google_access_token";
const PENDING_AUTH_KEY = "kizuna_google_pending_action";
const LOCAL_MARK_EVENT_ID = "local-mark";
/** Prefix when user unchecked Gカレ but we still keep the real event id. */
const SKIP_PREFIX = "skip:";

type PendingGoogleAction = {
  type: "export";
  todos: TodoItem[];
  force?: boolean;
} | {
  type: "auth-only";
};

function prefersRedirectAuth(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function oauthRedirectUri(): string {
  return window.location.origin;
}

function getCachedToken(): string | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; expiresAt?: number };
    if (
      typeof parsed.token === "string" &&
      typeof parsed.expiresAt === "number" &&
      Date.now() < parsed.expiresAt - 30_000
    ) {
      return parsed.token;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveCachedToken(token: string, expiresInSec: number) {
  sessionStorage.setItem(
    TOKEN_CACHE_KEY,
    JSON.stringify({
      token,
      expiresAt: Date.now() + Math.max(60, expiresInSec) * 1000,
    })
  );
}

function stashPendingAction(action: PendingGoogleAction) {
  sessionStorage.setItem(PENDING_AUTH_KEY, JSON.stringify(action));
}

function takePendingAction(): PendingGoogleAction | null {
  try {
    const raw = sessionStorage.getItem(PENDING_AUTH_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_AUTH_KEY);
    return JSON.parse(raw) as PendingGoogleAction;
  } catch {
    sessionStorage.removeItem(PENDING_AUTH_KEY);
    return null;
  }
}

/**
 * Read access_token from an OAuth implicit redirect hash.
 * Docs: https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow
 */
export function consumeGoogleOAuthRedirect(): {
  ok: boolean;
  error?: string;
} {
  if (typeof window === "undefined") return { ok: false };
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : "";
  if (!hash.includes("access_token=") && !hash.includes("error=")) {
    return { ok: false };
  }

  const params = new URLSearchParams(hash);
  const error = params.get("error");
  const token = params.get("access_token");
  const expiresIn = Number(params.get("expires_in") || "3600");

  history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search
  );

  if (error) {
    if (
      (error === "interaction_required" ||
        error === "login_required" ||
        error === "consent_required") &&
      sessionStorage.getItem("kizuna_google_force_consent") !== "1"
    ) {
      sessionStorage.setItem("kizuna_google_force_consent", "1");
      startImplicitRedirect(true);
    }
    return { ok: false, error };
  }
  if (!token) {
    return { ok: false, error: "token_missing" };
  }

  saveCachedToken(token, expiresIn);
  localStorage.setItem(CONNECTED_FLAG_KEY, "1");
  return { ok: true };
}

export async function resumePendingGoogleExport(): Promise<GoogleExportResult | null> {
  const pending = takePendingAction();
  if (!pending || pending.type !== "export") {
    return null;
  }
  return exportTodosToGoogleCalendar(pending.todos, { force: pending.force });
}

function startImplicitRedirect(forceConsent = false) {
  const clientId = getClientId();
  const useConsent =
    forceConsent || localStorage.getItem(CONNECTED_FLAG_KEY) !== "1";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: oauthRedirectUri(),
    response_type: "token",
    scope: CALENDAR_SCOPE,
    include_granted_scopes: "true",
    prompt: useConsent ? "consent" : "none",
    state: "gcal",
  });
  window.location.assign(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}

function resolveStoredEventId(raw: string | undefined): string | null {
  if (!raw || raw === LOCAL_MARK_EVENT_ID || raw.startsWith("bg:")) return null;
  const id = raw.startsWith(SKIP_PREFIX) ? raw.slice(SKIP_PREFIX.length) : raw;
  if (!id || id === LOCAL_MARK_EVENT_ID || id.startsWith("bg:")) return null;
  return id;
}

function isCheckedExportValue(raw: string | undefined): boolean {
  return Boolean(raw && !raw.startsWith(SKIP_PREFIX) && !raw.startsWith("bg:"));
}

type TokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => TokenClient;
          hasGrantedAllScopes: (
            tokenResponse: TokenResponse,
            ...scopes: string[]
          ) => boolean;
        };
      };
    };
  }
}

export type GoogleExportResult = {
  created: number;
  skipped: number;
  failed: number;
  errors: string[];
  cleanedBackgrounds?: number;
};

export type GoogleExportOptions = {
  /**
   * When true, ignore the local "already exported" cache and create events
   * again (may duplicate on Google Calendar).
   */
  force?: boolean;
};

function getClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(getClientId());
}

function isDateTask(todo: TodoItem): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(todo.dateStr);
}

function nextDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + 1);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function loadExportMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(EXPORT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveExportMap(map: Record<string, string>) {
  localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify(map));
}

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${GIS_SCRIPT_SRC}"]`
  );
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Google Identity Services の読み込みに失敗しました")),
        { once: true }
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Google Identity Services の読み込みに失敗しました"));
    document.head.appendChild(script);
  });
}

function requestAccessToken(): Promise<string> {
  const clientId = getClientId();
  if (!clientId) {
    return Promise.reject(
      new Error(
        "VITE_GOOGLE_CLIENT_ID が未設定です。GOOGLE_CALENDAR_SETUP.md を参照してください。"
      )
    );
  }

  consumeGoogleOAuthRedirect();
  const cached = getCachedToken();
  if (cached) {
    return Promise.resolve(cached);
  }

  // iOS/Android: GIS popup often cannot return the token to the app.
  // Use same-window implicit redirect instead.
  // Docs: https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow
  if (prefersRedirectAuth()) {
    startImplicitRedirect();
    return new Promise(() => {
      /* page navigates away */
    });
  }

  return new Promise(async (resolve, reject) => {
    try {
      await loadGisScript();
      if (!window.google?.accounts?.oauth2) {
        reject(new Error("Google Identity Services が利用できません"));
        return;
      }

      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: CALENDAR_SCOPE,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(
              new Error(
                response.error_description ||
                  response.error ||
                  "Google認証に失敗しました"
              )
            );
            return;
          }
          if (
            !window.google!.accounts.oauth2.hasGrantedAllScopes(
              response,
              CALENDAR_SCOPE
            )
          ) {
            reject(
              new Error(
                "Googleカレンダーへの予定追加権限が許可されていません"
              )
            );
            return;
          }
          localStorage.setItem(CONNECTED_FLAG_KEY, "1");
          saveCachedToken(response.access_token, 3600);
          resolve(response.access_token);
        },
        error_callback: (error) => {
          if (
            error.type === "popup_failed_to_open" ||
            error.type === "popup_closed"
          ) {
            if (!sessionStorage.getItem(PENDING_AUTH_KEY)) {
              stashPendingAction({ type: "auth-only" });
            }
            startImplicitRedirect(true);
            return;
          }
          reject(
            new Error(error.message || error.type || "Google認証がキャンセルされました")
          );
        },
      });

      const alreadyConnected = localStorage.getItem(CONNECTED_FLAG_KEY) === "1";
      tokenClient.requestAccessToken({
        prompt: alreadyConnected ? "" : "consent",
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<boolean> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  return res.ok || res.status === 404 || res.status === 410;
}

async function insertAllDayEvent(
  accessToken: string,
  todo: TodoItem
): Promise<string> {
  const body = {
    summary: todo.text,
    description: todo.completed
      ? "Kizuna Calendar からエクスポート（完了済み）"
      : "Kizuna Calendar からエクスポート",
    start: { date: todo.dateStr },
    end: { date: nextDay(todo.dateStr) },
    extendedProperties: {
      private: {
        kizunaTodoId: todo.id,
        source: "kizuna-calendar",
      },
    },
  };

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Calendar API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { id?: string };
  if (!data.id) {
    throw new Error("イベントIDが返りませんでした");
  }
  return data.id;
}

/**
 * Remove leftover "■ 背景色" placeholder events from an earlier experiment.
 */
async function cleanupDayBackgroundPlaceholders(
  accessToken: string,
  exportMap: Record<string, string>
): Promise<number> {
  let cleaned = 0;
  const keys = Object.keys(exportMap).filter((key) => key.startsWith("bg:"));
  for (const key of keys) {
    const eventId = exportMap[key];
    try {
      await deleteCalendarEvent(accessToken, eventId);
      delete exportMap[key];
      cleaned += 1;
    } catch (error) {
      logger.warn("Failed to delete background placeholder:", key, error);
      delete exportMap[key];
    }
  }
  if (cleaned > 0) {
    saveExportMap(exportMap);
  }
  return cleaned;
}

/**
 * Export date-based todos to the signed-in user's primary Google Calendar
 * as all-day events. Skips todos already exported from this browser.
 * Date/background colors are intentionally not synced.
 */
export async function exportTodosToGoogleCalendar(
  todos: TodoItem[],
  options: GoogleExportOptions = {}
): Promise<GoogleExportResult> {
  const targets = todos.filter(isDateTask);
  const result: GoogleExportResult = {
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    cleanedBackgrounds: 0,
  };

  if (targets.length === 0) {
    return result;
  }

  if (prefersRedirectAuth() && !getCachedToken()) {
    stashPendingAction({
      type: "export",
      todos: targets,
      force: Boolean(options.force),
    });
  }

  const accessToken = await requestAccessToken();
  const exportMap = loadExportMap();
  const force = Boolean(options.force);

  result.cleanedBackgrounds = await cleanupDayBackgroundPlaceholders(
    accessToken,
    exportMap
  );

  for (const todo of targets) {
    if (!force && todo.googleChecked) {
      result.skipped += 1;
      continue;
    }

    try {
      const eventId = await insertAllDayEvent(accessToken, todo);
      exportMap[todo.id] = eventId;
      saveExportMap(exportMap);
      await updateTodoGoogleMark(todo.id, {
        googleEventId: eventId,
        googleChecked: true,
      });
      todo.googleEventId = eventId;
      todo.googleChecked = true;
      result.created += 1;
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${todo.text}: ${message}`);
      logger.error("Google Calendar export failed:", todo.id, error);
    }
  }

  return result;
}

export type GoogleImportCandidate = {
  eventId: string;
  dateStr: string;
  text: string;
};

export type GoogleImportListResult = {
  /** Events that are on Google but not matched to existing app todos. */
  toImport: GoogleImportCandidate[];
  /** Already linked by event id or same date+title in the app. */
  skippedMatched: number;
  /** Cancelled / empty / out-of-range / ignored placeholders. */
  skippedOther: number;
};

type GoogleCalendarListEvent = {
  id?: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function monthTimeBounds(
  year: number,
  month: number
): { timeMin: string; timeMax: string; monthStart: string; monthEndExclusive: string } {
  // Local calendar month [first day, next month first day)
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);
  const monthStart = `${year}-${pad2(month)}-01`;
  const ey = end.getFullYear();
  const em = end.getMonth() + 1;
  const monthEndExclusive = `${ey}-${pad2(em)}-01`;
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    monthStart,
    monthEndExclusive,
  };
}

function eventStartDateStr(event: GoogleCalendarListEvent): string | null {
  if (event.start?.date && /^\d{4}-\d{2}-\d{2}$/.test(event.start.date)) {
    return event.start.date;
  }
  if (event.start?.dateTime) {
    const d = new Date(event.start.dateTime);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  return null;
}

function eventDisplayText(event: GoogleCalendarListEvent): string {
  const summary = (event.summary || "").trim() || "(無題)";
  if (event.start?.dateTime) {
    const d = new Date(event.start.dateTime);
    if (!Number.isNaN(d.getTime())) {
      const hh = pad2(d.getHours());
      const mm = pad2(d.getMinutes());
      return `${hh}:${mm} ${summary}`;
    }
  }
  return summary;
}

function normalizeTodoText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * List primary-calendar events in the given month that are not already
 * represented in existingTodos.
 *
 * Safety: read-only against Google (events.list only). Does not delete or
 * update any app todos. Caller must only addTodo for `toImport`.
 */
export async function listGoogleCalendarEventsToImport(
  year: number,
  month: number,
  existingTodos: TodoItem[]
): Promise<GoogleImportListResult> {
  // Docs: https://developers.google.com/calendar/api/v3/reference/events/list
  if (prefersRedirectAuth() && !getCachedToken()) {
    stashPendingAction({ type: "auth-only" });
  }
  const accessToken = await requestAccessToken();
  const { timeMin, timeMax, monthStart, monthEndExclusive } = monthTimeBounds(
    year,
    month
  );
  const exportMap = loadExportMap();
  const linkedEventIds = new Set<string>();
  for (const id of Object.values(exportMap)) {
    const resolved = resolveStoredEventId(id);
    if (resolved) linkedEventIds.add(resolved);
  }
  for (const todo of existingTodos) {
    if (todo.googleEventId) linkedEventIds.add(todo.googleEventId);
  }

  const existingKeys = new Set(
    existingTodos
      .filter((t) => isDateTask(t))
      .map((t) => `${t.dateStr}|${normalizeTodoText(t.text)}`)
  );

  const toImport: GoogleImportCandidate[] = [];
  const seenEventIds = new Set<string>();
  let skippedMatched = 0;
  let skippedOther = 0;
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Calendar API ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      items?: GoogleCalendarListEvent[];
      nextPageToken?: string;
    };

    for (const event of data.items || []) {
      if (!event.id || seenEventIds.has(event.id)) {
        skippedOther += 1;
        continue;
      }
      seenEventIds.add(event.id);

      if (event.status === "cancelled") {
        skippedOther += 1;
        continue;
      }

      const dateStr = eventStartDateStr(event);
      if (!dateStr || dateStr < monthStart || dateStr >= monthEndExclusive) {
        skippedOther += 1;
        continue;
      }

      const text = eventDisplayText(event);
      if (text.startsWith("■ 背景色")) {
        skippedOther += 1;
        continue;
      }

      if (linkedEventIds.has(event.id)) {
        skippedMatched += 1;
        continue;
      }

      const key = `${dateStr}|${normalizeTodoText(text)}`;
      if (existingKeys.has(key)) {
        skippedMatched += 1;
        continue;
      }

      // Avoid duplicate candidates within the same import batch
      existingKeys.add(key);
      linkedEventIds.add(event.id);
      toImport.push({ eventId: event.id, dateStr, text });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return { toImport, skippedMatched, skippedOther };
}

/** Record that a todo is linked to a Google event (DB + local cache). */
export async function linkTodoToGoogleEvent(
  todoId: string,
  eventId: string
): Promise<void> {
  if (!todoId || !eventId || eventId === LOCAL_MARK_EVENT_ID) return;
  const map = loadExportMap();
  map[todoId] = eventId;
  saveExportMap(map);
  await updateTodoGoogleMark(todoId, {
    googleEventId: eventId,
    googleChecked: true,
  });
}

export function isTodoGoogleChecked(todo: TodoItem): boolean {
  return Boolean(todo.googleChecked);
}

export function todoGoogleEventId(todo: TodoItem | undefined): string | null {
  if (!todo?.googleEventId) return null;
  return resolveStoredEventId(todo.googleEventId);
}

export function hasGoogleCalendarEvent(todo: TodoItem | undefined): boolean {
  return Boolean(todoGoogleEventId(todo));
}

/**
 * Delete the linked Google Calendar event for a todo (if any) and clear the
 * local export mark. Manual local-mark entries are cleared without an API call.
 */
export async function deleteTodoFromGoogleCalendar(
  todoId: string,
  eventIdFromTodo?: string | null
): Promise<{ deleted: boolean; skipped: boolean }> {
  const exportMap = loadExportMap();
  const eventId =
    resolveStoredEventId(eventIdFromTodo || undefined) ||
    resolveStoredEventId(exportMap[todoId]);

  if (!eventId) {
    delete exportMap[todoId];
    saveExportMap(exportMap);
    await updateTodoGoogleMark(todoId, {
      googleEventId: null,
      googleChecked: false,
    });
    return { deleted: false, skipped: true };
  }

  const accessToken = await requestAccessToken();
  const ok = await deleteCalendarEvent(accessToken, eventId);
  if (!ok) {
    throw new Error("Googleカレンダーの予定を削除できませんでした");
  }
  delete exportMap[todoId];
  saveExportMap(exportMap);
  await updateTodoGoogleMark(todoId, {
    googleEventId: null,
    googleChecked: false,
  });
  return { deleted: true, skipped: false };
}

/**
 * Set or clear the Gカレ checkbox in the database.
 * Unchecking keeps the real Google event id so a later delete can still
 * remove it from Google. Does not create or delete Google events by itself.
 */
export async function setGoogleCalendarExportMark(
  todo: TodoItem,
  marked: boolean
): Promise<void> {
  const eventId = todoGoogleEventId(todo);
  const map = loadExportMap();

  if (marked) {
    map[todo.id] = eventId || LOCAL_MARK_EVENT_ID;
    saveExportMap(map);
    await updateTodoGoogleMark(todo.id, {
      googleEventId: eventId,
      googleChecked: true,
    });
    return;
  }

  if (eventId) {
    map[todo.id] = SKIP_PREFIX + eventId;
    saveExportMap(map);
    await updateTodoGoogleMark(todo.id, {
      googleEventId: eventId,
      googleChecked: false,
    });
    return;
  }

  delete map[todo.id];
  saveExportMap(map);
  await updateTodoGoogleMark(todo.id, {
    googleEventId: null,
    googleChecked: false,
  });
}

/** Remove Google link/mark for a todo (does not call Google API). */
export async function clearGoogleCalendarLink(todoId: string): Promise<void> {
  const map = loadExportMap();
  delete map[todoId];
  saveExportMap(map);
  await updateTodoGoogleMark(todoId, {
    googleEventId: null,
    googleChecked: false,
  });
}

const LOCAL_MARKS_MIGRATED_KEY = "kizuna_google_marks_migrated_v1";

/** One-time copy of this browser's Gカレ marks into Supabase. */
export async function migrateLocalGoogleMarksToDatabase(
  todos: TodoItem[]
): Promise<number> {
  if (localStorage.getItem(LOCAL_MARKS_MIGRATED_KEY) === "1") {
    return 0;
  }
  const map = loadExportMap();
  const byId = new Map(todos.map((t) => [t.id, t]));
  let migrated = 0;

  for (const [todoId, raw] of Object.entries(map)) {
    if (todoId.startsWith("bg:")) continue;
    const todo = byId.get(todoId);
    if (!todo) continue;
    if (todo.googleChecked || todo.googleEventId) continue;

    const checked = isCheckedExportValue(raw);
    const eventId = resolveStoredEventId(raw);
    const ok = await updateTodoGoogleMark(todoId, {
      googleEventId: eventId,
      googleChecked: checked,
    });
    if (ok) {
      todo.googleEventId = eventId;
      todo.googleChecked = checked;
      migrated += 1;
    }
  }

  localStorage.setItem(LOCAL_MARKS_MIGRATED_KEY, "1");
  return migrated;
}

/** Clear local export cache so the next export is not skipped. */
export function clearGoogleCalendarExportHistory(): void {
  localStorage.removeItem(EXPORT_STORAGE_KEY);
}
