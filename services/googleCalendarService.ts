/**
 * Google Calendar export via Google Identity Services (token model).
 * Docs:
 * - https://developers.google.com/identity/oauth2/web/guides/use-token-model
 * - https://developers.google.com/calendar/api/v3/reference/events/insert
 */

import { TodoItem } from "../types";
import { logger } from "./logger";

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const EXPORT_STORAGE_KEY = "kizuna_google_calendar_exports";
const CONNECTED_FLAG_KEY = "kizuna_google_calendar_connected";

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
          resolve(response.access_token);
        },
        error_callback: (error) => {
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
    // All-day end is exclusive: https://developers.google.com/calendar/api/v3/reference/events/insert
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
 * Export date-based todos to the signed-in user's primary Google Calendar
 * as all-day events. Skips todos already exported from this browser.
 */
export async function exportTodosToGoogleCalendar(
  todos: TodoItem[]
): Promise<GoogleExportResult> {
  const targets = todos.filter(isDateTask);
  const result: GoogleExportResult = {
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  if (targets.length === 0) {
    return result;
  }

  const accessToken = await requestAccessToken();
  const exportMap = loadExportMap();

  for (const todo of targets) {
    if (exportMap[todo.id]) {
      result.skipped += 1;
      continue;
    }

    try {
      const eventId = await insertAllDayEvent(accessToken, todo);
      exportMap[todo.id] = eventId;
      saveExportMap(exportMap);
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
