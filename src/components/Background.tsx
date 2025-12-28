// src/components/FullBackground.tsx
import React from "react";
import background from "../assets/background.png";

const Background: React.FC = () => {
  return (
    <div
      style={{
        backgroundImage: `url(${background})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
};

export default Background;
