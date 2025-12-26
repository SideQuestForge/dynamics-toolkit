# Dynamics Toolkit
**Engineering Tools for Structural Dynamics**

Built by **SideQuestForge**, the engineering lab of a Structural Dynamics Engineer at NASA. These tools are designed to solve the real-world problems faced by dynamicists daily—without the bloat, licensing fees, or installation headaches of traditional software.

## The Tools

### [Shock Response Spectrum (SRS) Calculator](https://sidequestforge.github.io/dynamics-toolkit/srs-calculator/)
A stateless, browser-based SRS calculator using SDOF time-domain integration.
- **Inputs**: Half-Sine, Sawtooth pulses.
- **Outputs**: Interactive Maximax Absolute Acceleration Spectrum.
- **Features**: Instant client-side calculation, interactive plots, no login required.

## Usage

### Run Locally
Since these tools are stateless and client-side, you can run them in two ways:

1.  **Direct File Open**: Simply double-click `index.html` or `srs-calculator/index.html` to open in your browser.
2.  **Local Server** (Recommended for file uploads):
    ```bash
    # Run from the repository root
    python3 -m http.server 8000
    # Open http://localhost:8000 in your browser
    ```

### Deployment
This toolkit is designed to be hosted via **GitHub Pages**.
1.  Push this repository to GitHub.
2.  Go to **Settings > Pages**.
3.  Select **Source** as `main branch` and **Folder** as `/ (root)`.
4.  Your tools will be live at `https://[your-username].github.io/dynamics-toolkit/`.

## About SideQuestForge
SideQuestForge is dedicated to building high-quality, "stateless" engineering tools. We believe that critical analysis tools should be accessible, reliable, and fast.

**Maintainer**: [Your Name] (Structural Dynamics Engineer, NASA)

---
*Disclaimer: This project is a personal endeavor and is not officially affiliated with or endorsed by the National Aeronautics and Space Administration (NASA).*