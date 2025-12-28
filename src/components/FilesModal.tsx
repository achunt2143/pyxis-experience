// src/components/FilesModal.tsx
import React, { useState, useEffect } from "react";
import "../styles/files-modal.scss";

interface FileItem {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modified?: string;
}

interface FilesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Declare navigator.geckoOS for TypeScript
declare global {
  interface Navigator {
    geckoOS?: {
      echo: {
        call: (
          service: string,
          method: string,
          params: Record<string, unknown>
        ) => Promise<unknown>;
      };
    };
  }
}

const FilesModal: React.FC<FilesModalProps> = ({ isOpen, onClose }) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState("/home");

  // Fetch files via Echo sys call
  const fetchFiles = async (path: string = "/home") => {
    setLoading(true);
    setError(null);

    try {
      const echo = navigator.geckoOS?.echo;
      if (!echo) {
        throw new Error("Echo service not available");
      }

      // Make Echo sys call to file service
      const response = await echo.call("com.geckoOS.fileManager", "listFiles", {
        path: path,
      });

      if (response && typeof response === "object") {
        const data = response as { success?: boolean; files?: FileItem[]; error?: string };
        
        if (data.success && data.files) {
          // Sort files: directories first, then alphabetically
          const sorted = (data.files as FileItem[]).sort((a, b) => {
            if (a.type === "directory" && b.type === "file") return -1;
            if (a.type === "file" && b.type === "directory") return 1;
            return a.name.localeCompare(b.name);
          });

          setFiles(sorted);
          setCurrentPath(path);
        } else {
          setError(data.error || "Failed to fetch files");
        }
      } else {
        setError("Invalid response from file service");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Files fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch files on modal open
  useEffect(() => {
    if (isOpen) {
      fetchFiles(currentPath);
    }
  }, [isOpen]);

  const handleFileClick = (file: FileItem) => {
    if (file.type === "directory") {
      // Navigate into directory
      fetchFiles(file.path);
    } else {
      // File clicked - you can add file preview/open logic here
      console.log("File selected:", file);
    }
  };

  const handleBackClick = () => {
    const parentPath = currentPath.split("/").slice(0, -1).join("/") || "/";
    if (parentPath !== currentPath) {
      fetchFiles(parentPath);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="files-modal-overlay" onClick={handleBackdropClick}>
      <div className="files-modal-backdrop" />
      <div className="files-modal">
        <div className="files-modal-header">
          <h2>Files</h2>
          <div className="files-modal-path">{currentPath}</div>
          <button className="files-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="files-modal-content">
          {loading ? (
            <div className="files-loading">
              <span className="spinner">⟳</span>
              <p>Loading files...</p>
            </div>
          ) : error ? (
            <div className="files-error">
              <p>Error: {error}</p>
              <button onClick={() => fetchFiles(currentPath)} className="retry-btn">
                Retry
              </button>
            </div>
          ) : files.length === 0 ? (
            <div className="files-empty">
              <p>No files found</p>
            </div>
          ) : (
            <>
              {currentPath !== "/" && (
                <button className="file-item-parent" onClick={handleBackClick}>
                  <span className="file-icon">↑</span>
                  <span className="file-name">..</span>
                </button>
              )}
              {files.map((file) => (
                <button
                  key={file.path}
                  className={`file-item file-item--${file.type}`}
                  onClick={() => handleFileClick(file)}
                >
                  <span className="file-icon">
                    {file.type === "directory" ? "📁" : "📄"}
                  </span>
                  <span className="file-name">{file.name}</span>
                  {file.size && (
                    <span className="file-size">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilesModal;
