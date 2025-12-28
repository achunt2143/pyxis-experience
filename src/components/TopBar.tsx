// src/components/TopBar.tsx
import React from "react";
import { MochiInput } from "remochi";
import { Container, Row, Col } from "react-bootstrap";
import "../styles/topbar.scss";

const TopBar: React.FC = () => {
  return (
    <div className="top-bar-wrapper">
      <Container fluid className="top-bar-container">
        <div className="top-bar">
          <Row className="align-items-center w-100 m-0 d-flex" style={{width: '100%'}}>
            <Col md='auto' className="top-bar-left px-0">
              <MochiInput type="search" placeholder="Search anything" />
            </Col>

            <Col className="d-flex justify-content-end px-0">
              <div className="top-bar-right">
                <button className="icon-btn">🔔</button>
                <button className="icon-btn">⚙️</button>
                <button className="icon-btn">🖥️</button>
                <button className="icon-btn">📶</button>
                <button className="icon-btn">🔊</button>

                <div className="top-bar-time">
                  <span className="time">11:03</span>
                  <span className="date">12/25/2025</span>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      </Container>
    </div>
  );
};

export default TopBar;
