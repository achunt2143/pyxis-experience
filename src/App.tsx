// src/App.tsx
import React, { useState } from "react";
import Background from "./components/Background";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import AppLauncher from "./components/AppLauncher";
import "./styles/app.scss";
import FilesModal from "./components/FilesModal";

const App: React.FC = () => {
  const [isAppLauncherOpen, setIsAppLauncherOpen] = useState(false);
  const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);

  return (
    <div className="app-container">
      <Background />
      <div className="app-content">
        <TopBar />
        <Sidebar 
        onAppsClick={() => setIsAppLauncherOpen(true)} 
        onFilesClick={() => setIsFilesModalOpen(true)} 
        />
        <AppLauncher
          isOpen={isAppLauncherOpen}
          onClose={() => setIsAppLauncherOpen(false)}
        />
        <FilesModal
          isOpen={isFilesModalOpen}
          onClose={() => setIsFilesModalOpen(false)}
        />
      </div>
    </div>
  );
};

export default App;
