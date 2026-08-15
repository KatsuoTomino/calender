import React, { useState, useRef, useEffect } from "react";
import { TodoItem, User, DateColor, DateColorType } from "../types";
import { generateId } from "../services/storageService";
import { uploadImageToR2, getImageUrl, deleteImageFromR2 } from "../services/r2Service";
import { logger } from "../services/logger";
import {
  clearGoogleCalendarLink,
  deleteTodoFromGoogleCalendar,
  exportTodosToGoogleCalendar,
  getGoogleExportedTodoIds,
  GoogleImportCandidate,
  hasGoogleCalendarEvent,
  isGoogleCalendarConfigured,
  isTodoExportedToGoogle,
  linkTodoToGoogleEvent,
  listGoogleCalendarEventsToImport,
  setGoogleCalendarExportMark,
} from "../services/googleCalendarService";
import Button from "./Button";

interface TodoListProps {
  date?: Date; // 日付ベースのタスクの場合
  dateStr?: string; // 直接dateStrを指定する場合（'important' | 'shopping'）
  title?: string; // カスタムタイトル（dateStrが指定されている場合に使用）
  todos: TodoItem[];
  onAddTodo: (todo: TodoItem) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onUpdateTodoImages: (id: string, imageUrls: string[] | null) => void;
  currentUser: User;
  onClose: () => void;
  dateColors?: DateColor[];
  onSetDateColor?: (dateStr: string, color: DateColorType) => void;
  onSetDateLabel?: (dateStr: string, label: string | null) => void;
  /** Force show Google Calendar export (e.g. month list of dated tasks) */
  showGoogleExport?: boolean;
  /**
   * When set (with showGoogleExport), show Gカレ import for this calendar month.
   * month is 1–12.
   */
  googleImportMonth?: { year: number; month: number };
  /** Hide the new-task input (read-only style lists) */
  hideAddForm?: boolean;
  /** Show each todo's dateStr in the list */
  showTodoDates?: boolean;
}

// 確認モーダルの型
interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmLabel: string;
  confirmBusyLabel: string;
  confirmTone?: "danger" | "primary";
  secondaryLabel?: string;
  onSecondary?: () => void;
}

// 通知トーストの型
interface ToastState {
  isVisible: boolean;
  message: string;
  type: "success" | "error";
}

const DATE_COLOR_OPTIONS: { color: DateColorType; bgClass: string; activeBorder: string; label: string }[] = [
  { color: "red", bgClass: "bg-red-200", activeBorder: "ring-red-400", label: "赤" },
  { color: "yellow", bgClass: "bg-yellow-200", activeBorder: "ring-yellow-400", label: "黄" },
  { color: "blue", bgClass: "bg-blue-200", activeBorder: "ring-blue-400", label: "青" },
  { color: "green", bgClass: "bg-green-200", activeBorder: "ring-green-400", label: "緑" },
  { color: "purple", bgClass: "bg-purple-200", activeBorder: "ring-purple-400", label: "紫" },
];

const DateColorPicker: React.FC<{
  dateStr: string;
  currentColor: DateColorType;
  onSetColor: (dateStr: string, color: DateColorType) => void;
}> = ({ dateStr, currentColor, onSetColor }) => {
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-[10px] sm:text-xs text-slate-400 mr-1">背景色</span>
      {DATE_COLOR_OPTIONS.map((opt) => (
        <button
          key={opt.color}
          onClick={() => onSetColor(dateStr, currentColor === opt.color ? null : opt.color)}
          className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full ${opt.bgClass} transition-all ${
            currentColor === opt.color
              ? `ring-2 ${opt.activeBorder} scale-110`
              : "hover:scale-110 opacity-70 hover:opacity-100"
          }`}
          title={opt.label}
          aria-label={`背景色: ${opt.label}`}
        />
      ))}
      {currentColor && (
        <button
          onClick={() => onSetColor(dateStr, null)}
          className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-all"
          title="色を解除"
          aria-label="背景色を解除"
        >
          <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};

const DateLabelInput: React.FC<{
  dateStr: string;
  currentLabel: string;
  onSetLabel: (dateStr: string, label: string | null) => void;
}> = ({ dateStr, currentLabel, onSetLabel }) => {
  const [value, setValue] = useState(currentLabel);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(currentLabel);
  }, [currentLabel, dateStr]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    onSetLabel(dateStr, trimmed || null);
    setIsEditing(false);
  };

  if (!isEditing && !currentLabel) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-400 hover:text-slate-600 transition-colors"
        title="ラベルを追加"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        ラベル
      </button>
    );
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") { setValue(currentLabel); setIsEditing(false); }
          }}
          placeholder="ラベルを入力"
          maxLength={10}
          className="w-24 sm:w-28 px-2 py-0.5 text-[10px] sm:text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md hover:bg-slate-200 transition-colors max-w-[100px] sm:max-w-[120px]"
      title="ラベルを編集"
    >
      <span className="truncate">{currentLabel}</span>
      <svg className="w-3 h-3 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
  );
};

const TodoList: React.FC<TodoListProps> = ({
  date,
  dateStr,
  title,
  todos,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  onUpdateTodoImages,
  currentUser,
  onClose,
  dateColors = [],
  onSetDateColor,
  onSetDateLabel,
  showGoogleExport = false,
  googleImportMonth,
  hideAddForm = false,
  showTodoDates = false,
}) => {
  const [newTodoText, setNewTodoText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingTodoId, setUploadingTodoId] = useState<string | null>(null);
  // 各タスクの画像URL（R2キー -> 表示用URL）のマッピング
  const [imageDisplayUrls, setImageDisplayUrls] = useState<Record<string, Record<string, string>>>({});
  const [failedImageKeys, setFailedImageKeys] = useState<Record<string, boolean>>({});
  // 拡大表示用の画像情報
  const [expandedImage, setExpandedImage] = useState<{
    todoId: string;
    imageKey: string;
    displayUrl: string;
    todoText: string;
  } | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    confirmLabel: "削除する",
    confirmBusyLabel: "削除中...",
  });
  const [toast, setToast] = useState<ToastState>({
    isVisible: false,
    message: "",
    type: "success",
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExportingToGoogle, setIsExportingToGoogle] = useState(false);
  const [isImportingFromGoogle, setIsImportingFromGoogle] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    candidates: GoogleImportCandidate[];
    skippedMatched: number;
  } | null>(null);
  /** Bump after export so Google checkmarks re-read localStorage. */
  const [googleExportTick, setGoogleExportTick] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const todoFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Helper to format date as YYYY-MM-DD in local timezone
  const formatLocalDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  // URLを検出してリンクに変換する関数
  const linkifyText = (text: string): React.ReactNode[] => {
    // URLの正規表現パターン（http/httpsで始まるURL）
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = urlPattern.exec(text)) !== null) {
      // URLの前のテキスト
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      
      // URLをリンクに変換
      const url = match[0];
      parts.push(
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {url}
        </a>
      );
      
      lastIndex = match.index + match[0].length;
    }

    // 残りのテキスト
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : [text];
  };

  useEffect(() => {
    if (hideAddForm) return;
    if (inputRef.current) inputRef.current.focus();
  }, [date, hideAddForm]);

  // ESCキーでモーダルを閉じる
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (expandedImage) {
          setExpandedImage(null);
        }
        if (importPreview) {
          setImportPreview(null);
        }
        if (confirmModal.isOpen) {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [expandedImage, confirmModal.isOpen, importPreview]);

  // 通知トーストを表示
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ isVisible: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, isVisible: false }));
    }, 3000);
  };

  // 確認モーダルを表示
  const showConfirmModal = (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: {
      confirmLabel?: string;
      confirmBusyLabel?: string;
      confirmTone?: "danger" | "primary";
      secondaryLabel?: string;
      onSecondary?: () => void;
    }
  ) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm,
      confirmLabel: options?.confirmLabel ?? "削除する",
      confirmBusyLabel: options?.confirmBusyLabel ?? "削除中...",
      confirmTone: options?.confirmTone ?? "danger",
      secondaryLabel: options?.secondaryLabel,
      onSecondary: options?.onSecondary,
    });
  };

  const closeConfirmModal = () => {
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  };

  // 画像URLを取得（Presigned URLを生成）
  useEffect(() => {
    const loadImageUrls = async () => {
      const urlMap: Record<string, Record<string, string>> = {};
      for (const todo of todos) {
        if (todo.imageUrls && todo.imageUrls.length > 0) {
          const todoImageUrls: Record<string, string> = {};
          for (const imageKey of todo.imageUrls) {
            // 既に取得済みの場合はスキップ
            if (imageDisplayUrls[todo.id]?.[imageKey]) {
              todoImageUrls[imageKey] = imageDisplayUrls[todo.id][imageKey];
              continue;
            }
            const displayUrl = await getImageUrl(imageKey);
            if (displayUrl) {
              todoImageUrls[imageKey] = displayUrl;
            } else {
              logger.warn("画像URLの取得に失敗:", imageKey);
            }
          }
          if (Object.keys(todoImageUrls).length > 0) {
            urlMap[todo.id] = todoImageUrls;
          }
        }
      }
      if (Object.keys(urlMap).length > 0) {
        setImageDisplayUrls((prev) => {
          const newMap = { ...prev };
          for (const [todoId, urls] of Object.entries(urlMap)) {
            newMap[todoId] = { ...newMap[todoId], ...urls };
          }
          return newMap;
        });
      }
    };
    loadImageUrls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos.map(t => t.id + (t.imageUrls?.join(',') || '')).join('|')]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoText.trim()) return;

    setIsUploading(true);
    const todoId = generateId();

    // dateStrが直接指定されている場合はそれを使用、そうでなければdateから生成
    const targetDateStr = dateStr || (date ? formatLocalDate(date) : '');

    const newItem: TodoItem = {
      id: todoId,
      dateStr: targetDateStr,
      text: newTodoText,
      completed: false,
      createdBy: currentUser.id,
    };

    onAddTodo(newItem);
    setNewTodoText("");
    setIsUploading(false);
  };

  const handleCheck = async (id: string) => {
    onToggleTodo(id);
  };

  const handleTodoImageSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    todoId: string
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const todo = todos.find((t) => t.id === todoId);
    const currentImageUrls = todo?.imageUrls || [];

    setUploadingTodoId(todoId);
    try {
      const uploadedKeys: string[] = [];
      
      // 複数ファイルを順次アップロード
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // 画像ファイルかチェック
        if (!file.type.startsWith("image/")) {
          alert(`${file.name}は画像ファイルではありません`);
          continue;
        }
        // サーバー経由アップロードの制限（Vercel request body ≈ 4.5MB）
        if (file.size > 10 * 1024 * 1024) {
          alert(`${file.name}のサイズは10MB以下にしてください`);
          continue;
        }

        const uploadedKey = await uploadImageToR2(file, todoId);
        if (uploadedKey) {
          uploadedKeys.push(uploadedKey);
          const displayUrl = await getImageUrl(uploadedKey);
          if (displayUrl) {
            setImageDisplayUrls((prev) => ({
              ...prev,
              [todoId]: {
                ...prev[todoId],
                [uploadedKey]: displayUrl,
              },
            }));
          } else {
            alert(
              "画像の保存には成功しましたが、表示用URLの取得に失敗しました。ページを再読み込みするか、再ログインしてください。"
            );
          }
        }
      }

      if (uploadedKeys.length > 0) {
        const updatedImageUrls = [...currentImageUrls, ...uploadedKeys];
        onUpdateTodoImages(todoId, updatedImageUrls);
        showToast(`${uploadedKeys.length}枚の画像を追加しました`);
      } else {
        alert(
          "画像のアップロードに失敗しました。ログイン状態とネットワークを確認してください。"
        );
      }
    } catch (error) {
      logger.error("画像アップロードエラー:", error);
      alert("画像のアップロードに失敗しました");
    } finally {
      setUploadingTodoId(null);
      // ファイル入力をリセット
      if (todoFileInputRefs.current[todoId]) {
        todoFileInputRefs.current[todoId]!.value = "";
      }
    }
  };

  // 画像をダウンロード（新しいタブで開く）
  const handleDownloadImage = (displayUrl: string) => {
    // 新しいタブで画像を開く（ユーザーが右クリックで保存可能）
    window.open(displayUrl, '_blank');
    showToast("画像を新しいタブで開きました");
  };

  const handleRemoveTodoImage = (todoId: string, imageKey: string) => {
    showConfirmModal(
      "画像を削除",
      "この画像を削除しますか？",
      async () => {
        closeConfirmModal();
        setIsDeleting(true);

        try {
          await deleteImageFromR2(imageKey);
        } catch (error) {
          logger.error("R2からの画像削除エラー:", error);
        }

        // データベースから画像URLを削除
        const todo = todos.find((t) => t.id === todoId);
        const updatedImageUrls = todo?.imageUrls?.filter(key => key !== imageKey) || [];
        onUpdateTodoImages(todoId, updatedImageUrls.length > 0 ? updatedImageUrls : null);
        
        // 表示用URLからも削除
        setImageDisplayUrls((prev) => {
          const newUrls = { ...prev };
          if (newUrls[todoId]) {
            const { [imageKey]: removed, ...rest } = newUrls[todoId];
            if (Object.keys(rest).length === 0) {
              delete newUrls[todoId];
            } else {
              newUrls[todoId] = rest;
            }
          }
          return newUrls;
        });

        setIsDeleting(false);
        showToast("画像を削除しました");
      }
    );
  };

  const performDeleteTodo = async (
    todoId: string,
    options: { alsoDeleteFromGoogle: boolean }
  ) => {
    const todo = todos.find((t) => t.id === todoId);
    const hadGoogleEvent = hasGoogleCalendarEvent(todoId);
    closeConfirmModal();
    setIsDeleting(true);

    try {
      if (options.alsoDeleteFromGoogle && hadGoogleEvent) {
        try {
          const result = await deleteTodoFromGoogleCalendar(todoId);
          if (result.deleted) {
            setGoogleExportTick((n) => n + 1);
          }
        } catch (error) {
          logger.error("Google Calendar delete error:", error);
          showToast(
            error instanceof Error
              ? error.message
              : "Gカレからの削除に失敗したため、タスクは残しています",
            "error"
          );
          return;
        }
      } else {
        // Drop local link entirely (keep Google event if any)
        clearGoogleCalendarLink(todoId);
        setGoogleExportTick((n) => n + 1);
      }

      if (todo?.imageUrls && todo.imageUrls.length > 0) {
        for (const imageKey of todo.imageUrls) {
          try {
            await deleteImageFromR2(imageKey);
          } catch {
            /* ignore */
          }
        }
      }

      onDeleteTodo(todoId);
      showToast(
        options.alsoDeleteFromGoogle && hadGoogleEvent
          ? "タスクとGカレの予定を削除しました"
          : "タスクを削除しました"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteTodo = (todoId: string) => {
    const todo = todos.find((t) => t.id === todoId);
    // GカレチェックON + 実イベントあり → 必ず両方削除
    const gCalChecked = isTodoExportedToGoogle(todoId);
    const canDeleteFromGoogle = hasGoogleCalendarEvent(todoId);

    if (gCalChecked && canDeleteFromGoogle) {
      showConfirmModal(
        "タスクを削除",
        `「${todo?.text || "このタスク"}」を削除しますか？\n\nGカレにチェックがあるため、Googleカレンダーの予定も削除します。`,
        () => {
          void performDeleteTodo(todoId, { alsoDeleteFromGoogle: true });
        },
        {
          confirmLabel: "両方削除",
          confirmBusyLabel: "削除中...",
        }
      );
      return;
    }

    showConfirmModal(
      "タスクを削除",
      `「${todo?.text || "このタスク"}」を削除しますか？`,
      () => {
        void performDeleteTodo(todoId, { alsoDeleteFromGoogle: false });
      }
    );
  };

  const canShowGoogleExport =
    showGoogleExport || (Boolean(date) && !dateStr);

  // Re-read export map when tick / todos change (localStorage is source of truth).
  void googleExportTick;
  const googleExportedIds = getGoogleExportedTodoIds();
  const pendingGoogleTodos = todos.filter(
    (t) => /^\d{4}-\d{2}-\d{2}$/.test(t.dateStr) && !googleExportedIds.has(t.id)
  );

  const runGoogleExport = async () => {
    setIsExportingToGoogle(true);
    try {
      // Only unchecked (not yet exported) todos.
      const result = await exportTodosToGoogleCalendar(pendingGoogleTodos, {
        force: false,
      });
      setGoogleExportTick((n) => n + 1);

      if (result.cleanedBackgrounds && result.cleanedBackgrounds > 0) {
        showToast(
          `以前の「背景色」予定を ${result.cleanedBackgrounds}件削除しました`
        );
      }
      if (result.created > 0 && result.failed === 0) {
        const skipNote =
          result.skipped > 0 ? `（追加済み ${result.skipped}件はスキップ）` : "";
        showToast(
          `Gカレに ${result.created}件追加しました${skipNote}`
        );
      } else if (result.created > 0) {
        showToast(
          `${result.created}件追加、${result.failed}件失敗`,
          "error"
        );
      } else if (result.skipped > 0 && result.failed === 0) {
        showToast("Gカレへすべて追加済みです");
      } else if (result.cleanedBackgrounds && result.cleanedBackgrounds > 0) {
        showToast(
          `以前の「背景色」予定を ${result.cleanedBackgrounds}件削除しました`
        );
      } else {
        showToast(
          result.errors[0] || "Gカレへの追加に失敗しました",
          "error"
        );
      }
    } catch (error) {
      logger.error("Google Calendar export error:", error);
      showToast(
        error instanceof Error
          ? error.message
          : "Gカレへの追加に失敗しました",
        "error"
      );
    } finally {
      setIsExportingToGoogle(false);
    }
  };

  const handleExportToGoogleCalendar = async () => {
    const canExportDay = Boolean(date) && !dateStr;
    if (!canExportDay && !showGoogleExport) return;

    if (!isGoogleCalendarConfigured()) {
      showToast(
        "Google連携が未設定です（VITE_GOOGLE_CLIENT_ID）",
        "error"
      );
      return;
    }

    if (pendingGoogleTodos.length === 0) {
      showToast(
        todos.length === 0
          ? "追加するタスクがありません"
          : "未追加のタスクはありません（Gカレの ✓ は追加済み。外すと再追加できます）",
        "error"
      );
      return;
    }

    await runGoogleExport();
  };

  const handleToggleGoogleExportMark = (todoId: string) => {
    const next = !googleExportedIds.has(todoId);
    setGoogleCalendarExportMark(todoId, next);
    setGoogleExportTick((n) => n + 1);
  };

  const applyGoogleImport = async (candidates: GoogleImportCandidate[]) => {
    for (const candidate of candidates) {
      const todo: TodoItem = {
        id: generateId(),
        dateStr: candidate.dateStr,
        text: candidate.text,
        completed: false,
        createdBy: currentUser.id,
      };
      onAddTodo(todo);
      linkTodoToGoogleEvent(todo.id, candidate.eventId);
    }
    setGoogleExportTick((n) => n + 1);
  };

  const handleImportFromGoogleCalendar = async () => {
    if (!googleImportMonth) return;

    if (!isGoogleCalendarConfigured()) {
      showToast(
        "Google連携が未設定です（VITE_GOOGLE_CLIENT_ID）",
        "error"
      );
      return;
    }

    setIsImportingFromGoogle(true);
    try {
      // Fetch candidates first, then show preview — never mutates existing todos.
      const result = await listGoogleCalendarEventsToImport(
        googleImportMonth.year,
        googleImportMonth.month,
        todos
      );

      if (result.toImport.length === 0) {
        if (result.skippedMatched > 0) {
          showToast("取り込む新規予定はありません（既存と一致）");
        } else {
          showToast("この月のGカレに取り込む予定がありません");
        }
        return;
      }

      setImportPreview({
        candidates: result.toImport,
        skippedMatched: result.skippedMatched,
      });
    } catch (error) {
      logger.error("Google Calendar import preview error:", error);
      showToast(
        error instanceof Error
          ? error.message
          : "Gカレ予定の取得に失敗しました",
        "error"
      );
    } finally {
      setIsImportingFromGoogle(false);
    }
  };

  const handleConfirmGoogleImport = async () => {
    if (!importPreview || importPreview.candidates.length === 0) return;
    const { candidates, skippedMatched } = importPreview;
    setIsImportingFromGoogle(true);
    try {
      await applyGoogleImport(candidates);
      setImportPreview(null);
      const skipNote =
        skippedMatched > 0
          ? `（既存一致 ${skippedMatched}件はスキップ）`
          : "";
      showToast(`Gカレから ${candidates.length}件取り込みました${skipNote}`);
    } catch (error) {
      logger.error("Google Calendar import error:", error);
      showToast(
        error instanceof Error
          ? error.message
          : "Gカレからの取り込みに失敗しました",
        "error"
      );
    } finally {
      setIsImportingFromGoogle(false);
    }
  };

  const formatTodoDateLabel = (value: string): string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const [, m, d] = value.split("-");
    return `${Number(m)}/${Number(d)}`;
  };

  const sortedTodos = [...todos].sort((a, b) => {
    if (showTodoDates && a.dateStr !== b.dateStr) {
      return a.dateStr.localeCompare(b.dateStr);
    }
    if (a.completed === b.completed) return 0;
    return a.completed ? 1 : -1;
  });

  return (
    <div className="h-full flex flex-col bg-white md:rounded-3xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-slate-50 bg-gradient-to-r from-white to-pink-50/30 shrink-0">
        <div className="flex justify-between items-center gap-2">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-slate-800">
              {title || (date ? `${date.getMonth() + 1}月${date.getDate()}日の予定` : 'タスク')}
            </h3>
            <p className="text-xs text-slate-400">
              {todos.filter((t) => !t.completed).length} tasks remaining
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* 表示月の Google カレンダーからインポート（追加のみ・削除なし） */}
            {showGoogleExport && googleImportMonth && (
              <button
                type="button"
                onClick={handleImportFromGoogleCalendar}
                disabled={isImportingFromGoogle || isExportingToGoogle}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium text-slate-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 hover:border-sky-300 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all touch-manipulation"
                title={`${googleImportMonth.year}年${googleImportMonth.month}月のGカレ予定を取り込む（既存タスクは削除しません）`}
                aria-label="Gカレから取り込む"
              >
                <svg
                  className="w-3.5 h-3.5 text-sky-600 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                <span className="whitespace-nowrap">
                  {isImportingFromGoogle
                    ? importPreview
                      ? "取込中…"
                      : "取得中…"
                    : "Gカレ取込"}
                </span>
              </button>
            )}
            {/* 日付タスク / 月一覧の Google カレンダーへエクスポート */}
            {canShowGoogleExport && (
              <button
                type="button"
                onClick={handleExportToGoogleCalendar}
                disabled={
                  isExportingToGoogle ||
                  isImportingFromGoogle ||
                  pendingGoogleTodos.length === 0
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium text-slate-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 hover:border-teal-300 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all touch-manipulation"
                title={
                  todos.length === 0
                    ? "この期間にタスクがありません。先にタスクを追加してください"
                    : pendingGoogleTodos.length === 0
                      ? "Gカレへすべて追加済みです（✓ を外すと再追加できます）"
                      : `Gカレ未追加 ${pendingGoogleTodos.length}件をGoogleカレンダーに追加`
                }
                aria-label="Gカレに未追加のタスクを追加"
              >
                <svg
                  className="w-3.5 h-3.5 text-teal-600 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span className="whitespace-nowrap">
                  {isExportingToGoogle
                    ? "Gカレ追加中…"
                    : pendingGoogleTodos.length === 0
                      ? "Gカレ 追加済み"
                      : `Gカレ (${pendingGoogleTodos.length})`}
                </span>
              </button>
            )}
            {/* モーダル表示の場合（important, shopping, monthly）または月一覧は×ボタン */}
            {(dateStr === 'important' || dateStr === 'shopping' || dateStr === 'monthly' || showGoogleExport) && (
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 active:scale-95 transition-transform"
                aria-label="閉じる"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
            {/* 日付ベースのタスクはモバイルのみ×ボタンを表示 */}
            {!dateStr && !showGoogleExport && (
              <button
                onClick={onClose}
                className="md:hidden p-2 text-slate-400 hover:text-slate-600 active:scale-95 transition-transform"
                aria-label="閉じる"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
        {/* カラーピッカーとラベル入力（日付ベースのタスクのみ） */}
        {!dateStr && date && (onSetDateColor || onSetDateLabel) && (
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {onSetDateColor && (
              <DateColorPicker
                dateStr={formatLocalDate(date)}
                currentColor={dateColors.find((dc) => dc.dateStr === formatLocalDate(date))?.color || null}
                onSetColor={onSetDateColor}
              />
            )}
            {onSetDateLabel && (
              <DateLabelInput
                dateStr={formatLocalDate(date)}
                currentLabel={dateColors.find((dc) => dc.dateStr === formatLocalDate(date))?.label || ""}
                onSetLabel={onSetDateLabel}
              />
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      {!hideAddForm && (
      <div className="p-4 bg-white border-b border-slate-100 shrink-0">
        <form onSubmit={handleAdd} className="relative">
          <input
            ref={inputRef}
            type="text"
            className="w-full pl-4 pr-14 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-pink-100 text-sm"
            placeholder="新しいタスク..."
            value={newTodoText}
            onChange={(e) => setNewTodoText(e.target.value)}
            disabled={isUploading}
          />
          <button
            type="submit"
            disabled={!newTodoText.trim() || isUploading}
            className="absolute right-1 top-1 bottom-1 bg-primary text-white px-4 rounded-lg font-bold text-lg hover:bg-pink-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? "..." : "+"}
          </button>
        </form>
      </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
        {sortedTodos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-60">
            <svg
              className="w-16 h-16 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
            <p>予定はありません</p>
          </div>
        ) : (
          sortedTodos.map((todo) => (
            <div
              key={todo.id}
              className={`group flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${
                todo.completed
                  ? "bg-slate-50 border-slate-100 opacity-60"
                  : "bg-white border-slate-100 shadow-sm hover:border-pink-200"
              }`}
            >
              <button
                onClick={() => handleCheck(todo.id)}
                className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  todo.completed
                    ? "bg-secondary border-secondary"
                    : "border-slate-300 hover:border-secondary"
                }`}
              >
                {todo.completed && (
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  {showTodoDates && (
                    <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-medium text-slate-500 tabular-nums">
                      {formatTodoDateLabel(todo.dateStr)}
                    </span>
                  )}
                  <span
                    className={`text-sm flex-1 min-w-0 ${
                      todo.completed
                        ? "line-through text-slate-400"
                        : "text-slate-700"
                    }`}
                  >
                    {linkifyText(todo.text)}
                  </span>
                  {canShowGoogleExport && (
                    <button
                      type="button"
                      onClick={() => handleToggleGoogleExportMark(todo.id)}
                      className="shrink-0 mt-0.5 inline-flex flex-col items-center gap-0.5 min-w-[2.25rem] cursor-pointer"
                      title={
                        googleExportedIds.has(todo.id)
                          ? "Gカレのチェックを外す（次回の追加対象になります）"
                          : "Gカレにチェックを付ける（次回の追加から除外）"
                      }
                      aria-label={
                        googleExportedIds.has(todo.id)
                          ? "Gカレ追加済み。クリックでチェックを外す"
                          : "Gカレ未追加。クリックでチェックを付ける"
                      }
                      aria-pressed={googleExportedIds.has(todo.id)}
                    >
                      <span className="text-[9px] font-medium leading-none text-teal-700">
                        Gカレ
                      </span>
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded border-2 transition-colors ${
                          googleExportedIds.has(todo.id)
                            ? "bg-teal-500 border-teal-500 text-white hover:bg-teal-600"
                            : "border-slate-300 bg-white hover:border-teal-400"
                        }`}
                      >
                        {googleExportedIds.has(todo.id) && (
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </span>
                    </button>
                  )}
                </div>
                {/* 画像一覧と追加ボタン */}
                <div className="mt-1 flex flex-col gap-2">
                  {/* 画像一覧 */}
                  {todo.imageUrls && todo.imageUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {todo.imageUrls.map((imageKey) => {
                        const displayUrl = imageDisplayUrls[todo.id]?.[imageKey];
                        const failed = failedImageKeys[`${todo.id}:${imageKey}`];
                        if (!displayUrl || failed) {
                          return (
                            <div
                              key={imageKey}
                              className="w-24 h-24 rounded-lg bg-slate-100 text-slate-400 text-[10px] flex items-center justify-center text-center p-1"
                              title={imageKey}
                            >
                              {failed ? "表示失敗" : "読み込み中…"}
                            </div>
                          );
                        }
                        
                        return (
                          <div 
                            key={imageKey} 
                            className="relative touch-manipulation"
                            onClick={() => setExpandedImage({
                              todoId: todo.id,
                              imageKey,
                              displayUrl,
                              todoText: todo.text,
                            })}
                            onTouchStart={(e) => {
                              e.preventDefault();
                              setExpandedImage({
                                todoId: todo.id,
                                imageKey,
                                displayUrl,
                                todoText: todo.text,
                              });
                            }}
                          >
                            <img
                              src={displayUrl}
                              alt={todo.text}
                              className="w-24 h-24 object-cover rounded-lg cursor-pointer hover:opacity-90 active:opacity-70 transition-opacity touch-manipulation"
                              draggable={false}
                              onError={() => {
                                setFailedImageKeys((prev) => ({
                                  ...prev,
                                  [`${todo.id}:${imageKey}`]: true,
                                }));
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* 画像追加ボタン（常に表示） */}
                  <div>
                    <input
                      ref={(el) => {
                        todoFileInputRefs.current[todo.id] = el;
                      }}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleTodoImageSelect(e, todo.id)}
                      className="hidden"
                      id={`todo-image-${todo.id}`}
                      disabled={uploadingTodoId === todo.id}
                    />
                    <label
                      htmlFor={`todo-image-${todo.id}`}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 bg-slate-50 rounded hover:bg-slate-100 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {uploadingTodoId === todo.id ? (
                        <>
                          <svg
                            className="animate-spin h-3 w-3"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          <span>アップロード中...</span>
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <span>画像を追加</span>
                        </>
                      )}
                    </label>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDeleteTodo(todo.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-red-300 hover:text-red-500 transition-opacity"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {/* 画像拡大モーダル */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm touch-none"
          onClick={() => setExpandedImage(null)}
          onTouchStart={(e) => {
            // 背景タッチで閉じる
            if (e.target === e.currentTarget) {
              setExpandedImage(null);
            }
          }}
        >
          {/* 閉じるボタン */}
          <button
            onClick={() => setExpandedImage(null)}
            className="absolute top-2 right-2 sm:top-4 sm:right-4 p-2 sm:p-3 text-white hover:bg-white/20 active:bg-white/30 rounded-full transition-colors z-10 touch-manipulation"
            aria-label="閉じる"
          >
            <svg
              className="w-6 h-6 sm:w-7 sm:h-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          
          {/* 操作ボタン（上部） */}
          <div
            className="absolute top-2 left-2 sm:top-4 sm:left-4 flex flex-col sm:flex-row gap-2 z-10"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => handleDownloadImage(expandedImage.displayUrl)}
              className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-white/95 hover:bg-white active:bg-white/80 text-slate-700 rounded-lg transition-colors touch-manipulation shadow-lg"
            >
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span className="text-xs sm:text-sm font-medium">開く</span>
            </button>
            <button
              onClick={() => {
                setExpandedImage(null);
                handleRemoveTodoImage(expandedImage.todoId, expandedImage.imageKey);
              }}
              className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-red-500/95 hover:bg-red-600 active:bg-red-700 text-white rounded-lg transition-colors touch-manipulation shadow-lg"
            >
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              <span className="text-xs sm:text-sm font-medium">削除</span>
            </button>
          </div>
          
          {/* 画像 */}
          <div
            className="relative w-full h-full flex items-center justify-center p-2 sm:p-4"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <img
              src={expandedImage.displayUrl}
              alt="拡大画像"
              className="max-w-full max-h-[90vh] sm:max-h-[80vh] w-auto h-auto object-contain rounded-lg shadow-2xl touch-manipulation"
              style={{ userSelect: 'none' }}
            />
          </div>
        </div>
      )}

      {/* Gカレ取込プレビューモーダル */}
      {importPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => {
            if (!isImportingFromGoogle) setImportPreview(null);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 m-4 max-w-md w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-800 mb-1 shrink-0">
              これらの予定を取り込みますか？
            </h3>
            <p className="text-xs text-slate-500 mb-3 shrink-0">
              {googleImportMonth
                ? `${googleImportMonth.year}年${googleImportMonth.month}月・${importPreview.candidates.length}件`
                : `${importPreview.candidates.length}件`}
              （既存タスクは変更・削除しません）
            </p>
            <ul className="flex-1 min-h-0 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50 mb-4">
              {importPreview.candidates.map((item) => (
                <li
                  key={item.eventId}
                  className="flex items-start gap-2 px-3 py-2.5 text-sm"
                >
                  <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-medium text-slate-500 tabular-nums">
                    {formatTodoDateLabel(item.dateStr)}
                  </span>
                  <span className="text-slate-700 break-words min-w-0">
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
            {importPreview.skippedMatched > 0 && (
              <p className="text-[11px] text-slate-400 mb-3 shrink-0">
                既存と一致した {importPreview.skippedMatched}件は一覧に含めていません
              </p>
            )}
            <div className="flex gap-2 justify-end flex-wrap shrink-0">
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                disabled={isImportingFromGoogle}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmGoogleImport()}
                disabled={isImportingFromGoogle}
                className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors disabled:opacity-50"
              >
                {isImportingFromGoogle
                  ? "取込中..."
                  : `${importPreview.candidates.length}件取り込む`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 確認モーダル */}
      {confirmModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={closeConfirmModal}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 m-4 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              {confirmModal.title}
            </h3>
            <p className="text-slate-600 mb-6 whitespace-pre-line">{confirmModal.message}</p>
            <div className="flex gap-2 justify-end flex-wrap">
              <button
                onClick={closeConfirmModal}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                disabled={isDeleting}
              >
                キャンセル
              </button>
              {confirmModal.secondaryLabel && confirmModal.onSecondary && (
                <button
                  onClick={confirmModal.onSecondary}
                  disabled={isDeleting}
                  className="px-4 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  {confirmModal.secondaryLabel}
                </button>
              )}
              <button
                onClick={confirmModal.onConfirm}
                disabled={isDeleting || isImportingFromGoogle}
                className={`px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 ${
                  confirmModal.confirmTone === "primary"
                    ? "bg-sky-500 hover:bg-sky-600"
                    : "bg-red-500 hover:bg-red-600"
                }`}
              >
                {isDeleting || isImportingFromGoogle
                  ? confirmModal.confirmBusyLabel
                  : confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 通知トースト */}
      {toast.isVisible && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg shadow-lg transition-all duration-300 ${
            toast.type === "success"
              ? "bg-green-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === "success" ? (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TodoList;
