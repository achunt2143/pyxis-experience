// src/components/Sidebar.tsx
import React from "react";
import "../styles/sidebar.scss";

interface SidebarProps {
  onAppsClick: () => void;
  onFilesClick: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onAppsClick, onFilesClick }) => {
  return (
    <div className="sidebar-wrapper">
      <div className="sidebar">
        <div className="sidebar-content">
          <button
            className="sidebar-btn"
            title="Apps"
            onClick={onAppsClick}
          >
            <span className="icon">⊞</span>
          </button>
          <button className="sidebar-btn" title="Web">
            <span className="icon">🌐</span>
          </button>
          <button className="sidebar-btn" title="Arrow">
            <span className="icon">›_</span>
          </button>
          <button className="sidebar-btn" title="Calendar">
            <span className="icon">📅</span>
          </button>
          <button
            className="sidebar-btn"
            title="Files"
            onClick={onFilesClick}
          >
            <span className="icon">📄</span>
          </button>
          <button className="sidebar-btn" title="Mail">
            <span className="icon">✉️</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
