import React, { useState, useRef, useEffect } from "react";
import { TodoItem, User } from "../types";
import { generateId } from "../services/storageService";
import { uploadImageToR2, getImageUrl, deleteImageFromR2 } from "../services/r2Service";
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
}

// 確認モーダルの型
interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

// 通知トーストの型
interface ToastState {
  isVisible: boolean;
  message: string;
  type: "success" | "error";
}

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
}) => {
  const [newTodoText, setNewTodoText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingTodoId, setUploadingTodoId] = useState<string | null>(null);
  // 各タスクの画像URL（R2キー -> 表示用URL）のマッピング
  const [imageDisplayUrls, setImageDisplayUrls] = useState<Record<string, Record<string, string>>>({});
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
  });
  const [toast, setToast] = useState<ToastState>({
    isVisible: false,
    message: "",
    type: "success",
  });
  const [isDeleting, setIsDeleting] = useState(false);

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
    if (inputRef.current) inputRef.current.focus();
  }, [date]);

  // ESCキーでモーダルを閉じる
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (expandedImage) {
          setExpandedImage(null);
        }
        if (confirmModal.isOpen) {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [expandedImage, confirmModal.isOpen]);

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
    onConfirm: () => void
  ) => {
    setConfirmModal({ isOpen: true, title, message, onConfirm });
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
            // R2キーの場合はPresigned URLを生成
            const displayUrl = await getImageUrl(imageKey);
            if (displayUrl) {
              todoImageUrls[imageKey] = displayUrl;
            } else {
              // Presigned URL生成に失敗した場合は元のキーを使用
              todoImageUrls[imageKey] = imageKey;
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
        // ファイルサイズチェック（10MB制限）
        if (file.size > 10 * 1024 * 1024) {
          alert(`${file.name}のサイズは10MB以下にしてください`);
          continue;
        }

        const uploadedKey = await uploadImageToR2(file, todoId);
        if (uploadedKey) {
          uploadedKeys.push(uploadedKey);
          // 表示用URLを取得
          const displayUrl = await getImageUrl(uploadedKey);
          if (displayUrl) {
            setImageDisplayUrls((prev) => ({
              ...prev,
              [todoId]: {
                ...prev[todoId],
                [uploadedKey]: displayUrl,
              },
            }));
          }
        }
      }

      if (uploadedKeys.length > 0) {
        // 既存の画像URLに新しい画像を追加
        const updatedImageUrls = [...currentImageUrls, ...uploadedKeys];
        onUpdateTodoImages(todoId, updatedImageUrls);
        showToast(`${uploadedKeys.length}枚の画像を追加しました`);
      } else {
        alert("画像のアップロードに失敗しました");
      }
    } catch (error) {
      console.error("画像アップロードエラー:", error);
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

        // R2から画像を削除
        try {
          console.log("🗑️ R2から画像を削除中:", imageKey);
          const deleted = await deleteImageFromR2(imageKey);
          if (deleted) {
            console.log("✅ R2からの画像削除成功");
          } else {
            console.warn("⚠️ R2からの画像削除に失敗しましたが、データベースからは削除します");
          }
        } catch (error) {
          console.error("❌ R2からの画像削除エラー:", error);
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

  const handleDeleteTodo = (todoId: string) => {
    const todo = todos.find((t) => t.id === todoId);
    showConfirmModal(
      "タスクを削除",
      `「${todo?.text || "このタスク"}」を削除しますか？`,
      async () => {
        closeConfirmModal();
        setIsDeleting(true);

        // タスクに画像がある場合はR2からも削除
        if (todo?.imageUrls && todo.imageUrls.length > 0) {
          for (const imageKey of todo.imageUrls) {
            try {
              console.log("🗑️ タスク削除に伴いR2から画像を削除中:", imageKey);
              const deleted = await deleteImageFromR2(imageKey);
              if (deleted) {
                console.log("✅ R2からの画像削除成功:", imageKey);
              } else {
                console.warn("⚠️ R2からの画像削除に失敗:", imageKey);
              }
            } catch (error) {
              console.error("❌ R2からの画像削除エラー:", error);
            }
          }
        }

        // タスクを削除
        onDeleteTodo(todoId);
        setIsDeleting(false);
        showToast("タスクを削除しました");
      }
    );
  };

  const sortedTodos = [...todos].sort((a, b) => {
    if (a.completed === b.completed) return 0;
    return a.completed ? 1 : -1;
  });

  return (
    <div className="h-full flex flex-col bg-white md:rounded-3xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-slate-50 flex justify-between items-center bg-gradient-to-r from-white to-pink-50/30 shrink-0">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-800">
            {title || (date ? `${date.getMonth() + 1}月${date.getDate()}日の予定` : 'タスク')}
          </h3>
          <p className="text-xs text-slate-400">
            {todos.filter((t) => !t.completed).length} tasks remaining
          </p>
        </div>
        {/* モーダル表示の場合（important, shopping, monthly）は常に×ボタンを表示 */}
        {(dateStr === 'important' || dateStr === 'shopping' || dateStr === 'monthly') && (
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
        {!dateStr && (
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

      {/* Input Area */}
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
                <span
                  className={`text-sm ${
                    todo.completed
                      ? "line-through text-slate-400"
                      : "text-slate-700"
                  }`}
                >
                  {linkifyText(todo.text)}
                </span>
                {/* 画像一覧と追加ボタン */}
                <div className="mt-1 flex flex-col gap-2">
                  {/* 画像一覧 */}
                  {todo.imageUrls && todo.imageUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {todo.imageUrls.map((imageKey) => {
                        const displayUrl = imageDisplayUrls[todo.id]?.[imageKey];
                        if (!displayUrl) return null;
                        
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
                              // タッチイベントでも拡大モーダルを開く
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
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
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
            <p className="text-slate-600 mb-6">{confirmModal.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={closeConfirmModal}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                disabled={isDeleting}
              >
                キャンセル
              </button>
              <button
                onClick={confirmModal.onConfirm}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isDeleting ? "削除中..." : "削除する"}
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
