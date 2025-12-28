// src/components/AppLauncher.tsx
import React, { useMemo } from "react";
import "../styles/app-launcher.scss";

interface App {
  id: string;
  name: string;
  icon: string;
}

interface AppLauncherProps {
  isOpen: boolean;
  onClose: () => void;
}

const APPS: App[] = [
  { id: "app-1", name: "App Store", icon: "📱" },
  { id: "app-2", name: "Brightness", icon: "☀️" },
  { id: "app-3", name: "Calendar", icon: "📅" },
  { id: "app-4", name: "Camera", icon: "📷" },
  { id: "app-5", name: "Clock", icon: "🕐" },
  { id: "app-6", name: "Contacts", icon: "👥" },
  { id: "app-7", name: "Email", icon: "✉️" },
  { id: "app-8", name: "Files", icon: "📄" },
  { id: "app-9", name: "Gallery", icon: "🖼️" },
  { id: "app-10", name: "Games", icon: "🎮" },
  { id: "app-11", name: "Maps", icon: "🗺️" },
  { id: "app-12", name: "Messages", icon: "💬" },
  { id: "app-13", name: "Notes", icon: "📝" },
  { id: "app-14", name: "Photos", icon: "📸" },
  { id: "app-15", name: "Settings", icon: "⚙️" },
  { id: "app-16", name: "Terminal", icon: "💻" },
  { id: "app-17", name: "Video", icon: "🎥" },
  { id: "app-18", name: "Web Browser", icon: "🌐" },
];

interface GroupedApps {
  [key: string]: App[];
}

const AppLauncher: React.FC<AppLauncherProps> = ({ isOpen, onClose }) => {
  // Group apps by first letter
  const groupedApps = useMemo(() => {
    const groups: GroupedApps = {};

    APPS.sort((a, b) => a.name.localeCompare(b.name)).forEach((app) => {
      const firstLetter = app.name[0].toUpperCase();
      if (!groups[firstLetter]) {
        groups[firstLetter] = [];
      }
      groups[firstLetter].push(app);
    });

    return groups;
  }, []);

  const handleAppClick = (app: App) => {
    console.log(`Launched: ${app.name}`);
    // Add your app launch logic here
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="app-launcher-overlay" onClick={handleBackdropClick}>
      <div className="app-launcher-backdrop" />
      <div className="app-launcher-modal">
        <div className="app-launcher-header">
          <h2>Applications</h2>
          <button className="app-launcher-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="app-launcher-content">
          {Object.keys(groupedApps)
            .sort()
            .map((letter) => (
              <div key={letter} className="app-group">
                <div className="app-group-header">{letter}</div>
                <div className="app-list">
                  {groupedApps[letter].map((app) => (
                    <button
                      key={app.id}
                      className="app-item"
                      onClick={() => handleAppClick(app)}
                      title={app.name}
                    >
                      <span className="app-icon">{app.icon}</span>
                      <span className="app-name">{app.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default AppLauncher;
