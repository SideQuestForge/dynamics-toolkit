document.addEventListener('DOMContentLoaded', () => {
    const calculateBtn = document.getElementById('calculateBtn');

    // Theme Toggle
    const themeToggle = document.getElementById('themeToggle');
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        // Re-calculate to update plots with new colors
        calculateSRS();
    });

    // Initial Calc
    // Trigger initial input handling to set description and visibility
    handleInput();

    calculateBtn.addEventListener('click', calculateSRS);

    // Live Update Listeners
    const inputs = ['pulseType', 'amplitude', 'duration', 'qFactor'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('input', handleInput);
        el.addEventListener('change', handleInput);
    });

    // File Input Listener
    document.getElementById('csvFile').addEventListener('change', handleFileUpload);
});

let customData = null; // Stores { time: [], accel: [] }

const pulseDescriptions = {
    'half-sine': 'Classic impact pulse. Used for general shock testing.',
    'sawtooth': 'Simulates crash tests and pyro-shocks. High high-frequency response.',
    'rectangular': 'Theoretical maximum velocity change. Envelops complex events.',
    'triangle-sym': 'Generic impulse shape.',
    'haversine': 'Smooth, continuous-acceleration pulse (shaker table).',
    'custom': 'User-uploaded CSV time history.'
};

function handleInput(e) {
    const pulseType = document.getElementById('pulseType').value;
    const fileGroup = document.getElementById('fileGroup');
    const ampGroup = document.getElementById('ampGroup');
    const durGroup = document.getElementById('durGroup');

    // Update Description
    document.getElementById('pulseDescription').textContent = pulseDescriptions[pulseType] || '';

    // Toggle Visibility
    if (pulseType === 'custom') {
        fileGroup.style.display = 'block';
        ampGroup.style.display = 'none';
        durGroup.style.display = 'none';
    } else {
        fileGroup.style.display = 'none';
        ampGroup.style.display = 'block';
        durGroup.style.display = 'block';
    }

    calculateSRS();
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('fileNameDisplay').textContent = `Selected: ${file.name}`;

    const reader = new FileReader();
    reader.onload = function (event) {
        const text = event.target.result;
        parseCSV(text, file.name);
        calculateSRS();
    };
    reader.readAsText(file);
}

function parseCSV(text, fileName) {
    const lines = text.trim().split(/\r\n|\n/);
    const time = [];
    const accel = [];

    lines.forEach(line => {
        // Skip headers if line doesn't start with number
        if (line.match(/^[a-zA-Z]/)) return;

        const parts = line.split(/,|\t/); // Split by comma or tab
        if (parts.length >= 2) {
            const t = parseFloat(parts[0]);
            const a = parseFloat(parts[1]);
            if (!isNaN(t) && !isNaN(a)) {
                time.push(t);
                accel.push(a);
            }
        }
    });

    if (time.length > 0) {
        customData = { time, accel, name: fileName };
    } else {
        alert("Could not parse CSV. Ensure format is: Time, Accel");
        customData = null;
    }
}

function getThemeColors() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return {
        paper_bgcolor: isLight ? '#f6f8fa' : '#161b22',
        plot_bgcolor: isLight ? '#f6f8fa' : '#161b22',
        font_color: isLight ? '#24292f' : '#f0f6fc',
        grid_color: isLight ? '#d0d7de' : '#30363d',
        accent_color: isLight ? '#0969da' : '#58a6ff'
    };
}

function calculateSRS() {
    // 1. Get Inputs
    const pulseType = document.getElementById('pulseType').value;
    const qFactor = parseFloat(document.getElementById('qFactor').value);
    const dampingRatio = 1 / (2 * qFactor);

    if (isNaN(qFactor)) return;

    let timeVector = [], accelVector = [], dt = 0;
    let displayAmp = document.getElementById('amplitude').value;
    let displayDur = document.getElementById('duration').value;

    if (pulseType === 'custom') {
        if (!customData) return; // No file yet

        displayAmp = customData.name || 'Custom CSV';
        displayDur = '';

        // Target dt same as generated pulses for consistent resolution
        const fMAX_SRS = 2000;
        const targetDt = 1 / (20 * fMAX_SRS); // 25 microseconds

        // Get original data bounds
        const origTime = customData.time;
        const origAccel = customData.accel;
        const pulseDuration = origTime[origTime.length - 1];

        // Extend to at least 5x pulse duration or 100ms for ringdown
        const targetDuration = Math.max(5 * pulseDuration, 0.1);

        // Interpolate original data to finer time step
        timeVector = [];
        accelVector = [];
        dt = targetDt;

        for (let t = 0; t <= targetDuration; t += targetDt) {
            timeVector.push(t);

            if (t <= pulseDuration) {
                // Linear interpolation within pulse
                // Find surrounding points
                let i = 0;
                while (i < origTime.length - 1 && origTime[i + 1] < t) i++;

                if (i >= origTime.length - 1) {
                    accelVector.push(origAccel[origAccel.length - 1]);
                } else {
                    // Linear interpolation: a = a0 + (a1 - a0) * (t - t0) / (t1 - t0)
                    const t0 = origTime[i];
                    const t1 = origTime[i + 1];
                    const a0 = origAccel[i];
                    const a1 = origAccel[i + 1];
                    const frac = (t - t0) / (t1 - t0);
                    const interpAccel = a0 + (a1 - a0) * frac;
                    accelVector.push(interpAccel);
                }
            } else {
                // Zero padding for ringdown
                accelVector.push(0);
            }
        }
    } else {
        const amplitude = parseFloat(document.getElementById('amplitude').value);
        const duration = parseFloat(document.getElementById('duration').value); // ms

        if (isNaN(amplitude) || isNaN(duration)) return;

        const durationSec = duration / 1000.0;
        const fMAX_SRS = 2000;
        dt = 1 / (20 * fMAX_SRS);

        let simDuration = Math.max(5 * durationSec, 0.1);
        const numSteps = Math.ceil(simDuration / dt);

        for (let i = 0; i <= numSteps; i++) {
            const t = i * dt;
            timeVector.push(t);
            accelVector.push(getPulseAcceleration(t, pulseType, amplitude, durationSec));
        }
    }

    // 3. Calculate SRS
    // Frequencies: Logarithmically spaced from 10Hz to 2000Hz (or higher)
    const freqs = generateLogFreqs(10, 2000, 50); // 50 points
    const srsMaxAbsAccel = [];

    freqs.forEach(fn => {
        const maxResp = solveSDOF(timeVector, accelVector, fn, dampingRatio, dt);
        srsMaxAbsAccel.push(maxResp);
    });

    // 4. Plot
    plotResults(freqs, srsMaxAbsAccel, timeVector, accelVector, pulseType, displayAmp, displayDur);
}

function getPulseAcceleration(t, type, amp, duration) {
    if (t > duration) return 0;
    if (t < 0) return 0;

    if (type === 'half-sine') {
        // A * sin(pi * t / Td)
        return amp * Math.sin(Math.PI * t / duration);
    } else if (type === 'sawtooth') {
        // Terminal Peak Sawtooth: Ramps up to A at Td, then drops.
        return amp * (t / duration);
    } else if (type === 'rectangular') {
        // Square wave: A for the whole duration
        return amp;
    } else if (type === 'triangle-sym') {
        // Symmetrical Triangle: Peaks at Td/2
        if (t <= duration / 2) {
            return amp * (t / (duration / 2));
        } else {
            return amp * (1 - (t - duration / 2) / (duration / 2));
        }
    } else if (type === 'haversine') {
        // Haversine Pulse: 0.5 * A * (1 - cos(2*pi*t/Td))
        // This starts at 0, peaks at A at Td/2, ends at 0 at Td.
        return amp * 0.5 * (1 - Math.cos(2 * Math.PI * t / duration));
    }
    return 0;
}

function solveSDOF(time, baseAccel, fn, zeta, dt) {
    // Solves z'' + 2*zeta*wn*z' + wn^2*z = -y''
    // Returns max(|x''|) where x'' = z'' + y'' (Absolute Acceleration)
    // Or typically SRS is Maximax Absolute Acceleration.

    const wn = 2 * Math.PI * fn;
    const wn2 = wn * wn;
    const c = 2 * zeta * wn;

    let z = 0;      // Relative Displacement
    let v = 0;      // Relative Velocity (z')
    let maxAbsAcc = 0;

    // Numerical Integration: Velocity Verlet
    // a = -y'' - c*v - wn2*z

    let a = -baseAccel[0] - c * v - wn2 * z;

    for (let i = 0; i < time.length - 1; i++) {
        // Current input
        const y_dd_i = baseAccel[i];
        const y_dd_next = baseAccel[i + 1];

        // Half step velocity
        const v_half = v + 0.5 * a * dt;

        // Full step position
        z = z + v_half * dt;

        // Update acceleration at t+dt (need to solve implicitly if damping depends on v? 
        // For Verlet with damping, we need a slight mod or use predictor-corrector. 
        // Simple standard method: Explicit Euler is unstable. 
        // Let's use Semi-Implicit Euler or basic RK4 if need be. 
        // Actually, for linear SDOF, there is an exact recursive formula (algorithms like Smallwood).
        // Let's try a simple Velocity Verlet approximation, usually fine for small dt.

        // Recalculate forces/accel at new position with estimated velocity?
        // Let's use a robust exact exponential hold method (Smallwood) logic simplified? 
        // No, let's just use standard finite difference capable of handling damping.
        // Newmark-Beta is standard in structural dynamics.

        // Newmark-Beta (Average Acceleration method, gamma=1/2, beta=1/4 - unconditionally stable)
        // constants
        // a1 = 1/(beta*dt^2) + gamma*c/(beta*dt) + wn^2
        // a2 = 1/(beta*dt) + (gamma/beta - 1)*c
        // a3 = (1/(2*beta) - 1) + dt*(gamma/(2*beta) - 1)*c

        // But implementing Newmark-Beta from scratch is verbose. 
        // Let's use Heun's method (Runge Kutta 2nd order) for simplicity/readability.

        // k1v = a(t, z, v) * dt
        // k1z = v * dt
        // k2v = a(t+dt, z+k1z, v+k1v) * dt
        // k2z = (v + k1v) * dt
        // No this is getting messy.

        // Let's use the actual exact digital filter coefficients for SDOF (Ramp Invariant / Smallwood).
        // It's the industry standard for SRS.
        // b0, b1, b2, a1, a2
        // y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
        // Where x is input accel, y is response absolute accel.

        // Coefficients for Smallwood Ramp Invariant:
        // E = exp(-zeta * wn * dt)
        // K = wn * dt * sqrt(1 - zeta^2)
        // C = E * cos(K)
        // S = E * sin(K)
        // S_prime = S / sqrt(1 - zeta^2)
        // ... It's complex to type out correctly without error from memory.

        // Fallback: simple symplectic Euler (Cromer) - very stable for oscillatory.
        // v = v + a * dt
        // z = z + v * dt
        // a = -y'' - 2*zeta*wn*v - wn^2*z

        // Update a
        const accel_rel = -y_dd_i - c * v - wn2 * z;
        v = v + accel_rel * dt;
        z = z + v * dt;

        const abs_accel = accel_rel + y_dd_i; // z'' + y''
        if (Math.abs(abs_accel) > maxAbsAcc) {
            maxAbsAcc = Math.abs(abs_accel);
        }
    }

    return maxAbsAcc;
}

function generateLogFreqs(start, end, points) {
    const arr = [];
    const logStart = Math.log10(start);
    const logEnd = Math.log10(end);
    const step = (logEnd - logStart) / (points - 1);

    for (let i = 0; i < points; i++) {
        arr.push(Math.pow(10, logStart + i * step));
    }
    return arr;
}

function plotResults(freqs, srs, timeVector, pulseVector, type, amp, dur) {
    const theme = getThemeColors();

    // 1. Plot SRS
    const srsTrace = {
        x: freqs,
        y: srs,
        mode: 'lines+markers',
        type: 'scatter',
        name: `SRS (Q=10)`,
        line: { color: theme.accent_color, width: 3 },
        marker: { size: 6 }
    };

    const srsLayout = {
        title: {
            text: `Shock Response Spectrum (Q=10)`,
            font: { color: theme.font_color }
        },
        paper_bgcolor: theme.paper_bgcolor,
        plot_bgcolor: theme.plot_bgcolor,
        xaxis: {
            type: 'log',
            title: 'Natural Frequency (Hz)',
            color: '#8b949e', // Keep secondary text color consistent or map to theme
            gridcolor: theme.grid_color
        },
        yaxis: {
            type: 'log',
            title: 'Peak Absolute Acceleration (G)',
            color: '#8b949e',
            gridcolor: theme.grid_color
        },
        showlegend: false,
        margin: { t: 40, r: 30, l: 60, b: 50 },
        font: { color: theme.font_color }
    };

    const config = { responsive: true };

    Plotly.newPlot('plotDiv', [srsTrace], srsLayout, config);

    // 2. Plot Time Domain Pulse
    const pulseTrace = {
        x: timeVector.map(t => t * 1000), // Convert to ms
        y: pulseVector,
        mode: 'lines',
        type: 'scatter',
        name: 'Input Pulse',
        line: { color: '#238636', width: 2 },
        fill: 'tozeroy',
        fillcolor: 'rgba(35, 134, 54, 0.2)'
    };

    let pulseTitle = `Input Pulse: ${type} (${amp}G, ${dur}ms)`;
    if (type === 'custom') {
        pulseTitle = `Input Pulse: ${amp}`;
    }

    const pulseLayout = {
        title: {
            text: pulseTitle,
            font: { color: theme.font_color, size: 14 }
        },
        paper_bgcolor: theme.paper_bgcolor,
        plot_bgcolor: theme.plot_bgcolor,
        xaxis: {
            title: 'Time (ms)',
            color: '#8b949e',
            gridcolor: theme.grid_color
        },
        yaxis: {
            title: 'Acceleration (G)',
            color: '#8b949e',
            gridcolor: theme.grid_color
        },
        showlegend: false,
        margin: { t: 40, r: 30, l: 60, b: 40 },
        font: { color: theme.font_color }
    };

    Plotly.newPlot('pulsePlotDiv', [pulseTrace], pulseLayout, config);
}

// ============================================
// SDOF ANIMATION SYSTEM
// ============================================

// Store last calculated pulse data for animation
let lastPulseData = null;

// Animation state
const animState = {
    isPlaying: false,
    currentFrame: 0,
    speed: 1,
    animationId: null,
    history: null, // { time, z, absAccel, baseAccel }
    maxZ: 1,
    baseScale: 50 // pixels per G of base motion
};

// Initialize tab switching and animation controls
document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Update button states
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update content visibility
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');

            // If switching to animation tab, check if we have data
            if (tabId === 'sdof-animation' && lastPulseData) {
                prepareAnimation();
            }
        });
    });

    // Frequency slider
    const freqSlider = document.getElementById('animFreq');
    if (freqSlider) {
        freqSlider.addEventListener('input', () => {
            const freq = Math.pow(10, parseFloat(freqSlider.value));
            document.getElementById('freqValue').textContent = freq.toFixed(0);
            if (lastPulseData) {
                computeAnimationHistory();
                resetAnimation();
                drawCurrentFrame();
            }
        });
    }

    // Playback controls
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', togglePlayPause);
    }

    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetAnimation);
    }

    const speedSelect = document.getElementById('speedSelect');
    if (speedSelect) {
        speedSelect.addEventListener('change', (e) => {
            animState.speed = parseFloat(e.target.value);
        });
    }

    // Response plot type selector
    const responsePlotType = document.getElementById('responsePlotType');
    if (responsePlotType) {
        responsePlotType.addEventListener('change', () => {
            plotTimeHistory();
        });
    }

    // Timeline scrubber for interactive animation control
    const timelineScrub = document.getElementById('timelineScrub');
    if (timelineScrub) {
        timelineScrub.addEventListener('input', (e) => {
            if (!animState.history) return;

            // Calculate frame from percentage
            const percent = parseFloat(e.target.value);
            const totalFrames = animState.history.time.length;
            animState.currentFrame = Math.floor((percent / 100) * (totalFrames - 1));

            // Update time display
            const time = animState.history.time[animState.currentFrame] * 1000;
            document.getElementById('scrubTime').textContent = time.toFixed(2);

            // If not playing, just draw the current frame (scrub preview)
            // If playing, animation loop will pick up from new position automatically
            if (!animState.isPlaying) {
                drawCurrentFrame();
            }
        });
    }

    // Anchor wall checkbox - redraw when toggled
    const anchorWall = document.getElementById('anchorWall');
    if (anchorWall) {
        anchorWall.addEventListener('change', () => {
            drawCurrentFrame();
        });
    }
});

// Called after SRS calculation to store pulse data
function storePulseData(timeVector, accelVector, qFactor) {
    lastPulseData = {
        time: [...timeVector],
        accel: [...accelVector],
        qFactor: qFactor,
        dt: timeVector.length > 1 ? (timeVector[timeVector.length - 1] - timeVector[0]) / (timeVector.length - 1) : 0.001
    };

    // Show animation container, hide placeholder
    const placeholder = document.getElementById('animationPlaceholder');
    const container = document.getElementById('animationContainer');
    if (placeholder) placeholder.style.display = 'none';
    if (container) container.style.display = 'flex';

    // Update Q display
    const zeta = 1 / (2 * qFactor);
    document.getElementById('animQDisplay').textContent = qFactor;
    document.getElementById('animZetaDisplay').textContent = (zeta * 100).toFixed(1) + '%';

    // Auto-recompute animation if animState has been initialized (user has used animation before)
    // This ensures animation updates when input params change
    if (animState.history || document.getElementById('sdof-animation').classList.contains('active')) {
        computeAnimationHistory();
        resetAnimation();
        drawCurrentFrame();
        plotTimeHistory();
    }
}

// Compute full time history for current frequency
function computeAnimationHistory() {
    if (!lastPulseData) return;

    const freqSlider = document.getElementById('animFreq');
    const fn = Math.pow(10, parseFloat(freqSlider.value));
    const zeta = 1 / (2 * lastPulseData.qFactor);

    const result = solveSDOFFullHistory(
        lastPulseData.time,
        lastPulseData.accel,
        fn,
        zeta,
        lastPulseData.dt
    );

    animState.history = result;
    // Use reduce instead of spread to avoid stack overflow with large arrays
    animState.maxZ = Math.max(result.z.reduce((max, val) => Math.max(max, Math.abs(val)), 0), 0.001);

    // Update peak display
    const peak = result.absAccel.reduce((max, val) => Math.max(max, Math.abs(val)), 0);
    document.getElementById('animPeakDisplay').textContent = peak.toFixed(2);

    // Plot time history 
    plotTimeHistory();
}

// Full history SDOF solver (returns arrays)
function solveSDOFFullHistory(time, baseAccel, fn, zeta, dt) {
    const wn = 2 * Math.PI * fn;
    const wn2 = wn * wn;
    const c = 2 * zeta * wn;

    const zHistory = [];
    const absAccelHistory = [];
    const baseDispHistory = []; // Base displacement via double integration

    let z = 0;      // Relative displacement
    let v = 0;      // Relative velocity
    let baseVel = 0;  // Base velocity (single integral of accel)
    let baseDisp = 0; // Base displacement (double integral of accel)

    for (let i = 0; i < time.length; i++) {
        const y_dd_i = baseAccel[i];

        // Store current state
        zHistory.push(z);
        baseDispHistory.push(baseDisp);

        // Compute absolute acceleration: z'' + y'' 
        const accel_rel = -y_dd_i - c * v - wn2 * z;
        const abs_accel = accel_rel + y_dd_i;
        absAccelHistory.push(abs_accel);

        // Integrate mass motion (Symplectic Euler)
        v = v + accel_rel * dt;
        z = z + v * dt;

        // Integrate base motion to get displacement
        baseVel = baseVel + y_dd_i * dt;
        baseDisp = baseDisp + baseVel * dt;
    }

    return {
        time: time,
        z: zHistory,
        absAccel: absAccelHistory,
        baseAccel: baseAccel,
        baseDisp: baseDispHistory  // Now includes true displacement
    };
}

// Plot time history inset
function plotTimeHistory() {
    if (!animState.history) return;

    const theme = getThemeColors();
    const h = animState.history;
    const plotType = document.getElementById('responsePlotType')?.value || 'input-response';

    // Time in ms
    const timeMs = h.time.map(t => t * 1000);

    // Scale displacement for visibility (mm)
    const scaledZ = h.z.map(z => z * 1000);

    // Absolute acceleration (already in G)
    const absAccel = h.absAccel;

    // Base acceleration (input, already in G)
    const baseAccel = h.baseAccel;

    const traces = [];

    // Input + Response mode (shows base input and mass response on same plot)
    if (plotType === 'input-response') {
        // Base excitation (input)
        traces.push({
            x: timeMs,
            y: baseAccel,
            mode: 'lines',
            name: 'Input ÿ (G)',
            line: { color: '#238636', width: 2.5 },
            fill: 'tozeroy',
            fillcolor: 'rgba(35, 134, 54, 0.15)'
        });
        // Mass response (output)
        traces.push({
            x: timeMs,
            y: absAccel,
            mode: 'lines',
            name: 'Response ẍ (G)',
            line: { color: '#f85149', width: 2 }
        });
    }

    // All mode: shows input, response acceleration, and displacement
    if (plotType === 'all') {
        // Base excitation (input)
        traces.push({
            x: timeMs,
            y: baseAccel,
            mode: 'lines',
            name: 'Input ÿ (G)',
            line: { color: '#238636', width: 2 },
            fill: 'tozeroy',
            fillcolor: 'rgba(35, 134, 54, 0.1)'
        });
        // Mass response (output)
        traces.push({
            x: timeMs,
            y: absAccel,
            mode: 'lines',
            name: 'Response ẍ (G)',
            line: { color: '#f85149', width: 2 }
        });
        // Displacement (on secondary axis)
        traces.push({
            x: timeMs,
            y: scaledZ,
            mode: 'lines',
            name: 'Disp z (mm)',
            yaxis: 'y2',
            line: { color: theme.accent_color, width: 2 }
        });
    }

    // Displacement trace (single)
    if (plotType === 'displacement') {
        traces.push({
            x: timeMs,
            y: scaledZ,
            mode: 'lines',
            name: 'Disp. z (mm)',
            line: { color: theme.accent_color, width: 2 }
        });
    }

    // Acceleration trace (single)
    if (plotType === 'acceleration') {
        traces.push({
            x: timeMs,
            y: absAccel,
            mode: 'lines',
            name: 'Accel. ẍ (G)',
            line: { color: '#f85149', width: 2 }
        });
    }

    // Build layout based on plot type
    let layout = {
        paper_bgcolor: theme.paper_bgcolor,
        plot_bgcolor: theme.plot_bgcolor,
        xaxis: {
            title: 'Time (ms)',
            color: '#8b949e',
            gridcolor: theme.grid_color
        },
        showlegend: (plotType === 'all' || plotType === 'input-response'),
        legend: {
            x: 0.5,
            y: 1.15,
            xanchor: 'center',
            orientation: 'h',
            font: { size: 10, color: theme.font_color }
        },
        margin: { t: 35, r: (plotType === 'all') ? 60 : 20, l: 55, b: 35 },
        font: { color: theme.font_color, size: 10 }
    };

    if (plotType === 'input-response') {
        layout.yaxis = { title: 'Accel (G)', color: '#8b949e', gridcolor: theme.grid_color };
        layout.title = { text: 'Input Excitation ÿ(t) vs Mass Response ẍ(t)', font: { size: 12, color: theme.font_color } };
    } else if (plotType === 'all') {
        // Dual y-axes: Accel on left, displacement on right
        layout.yaxis = {
            title: 'Accel (G)',
            color: '#8b949e',
            gridcolor: theme.grid_color,
            side: 'left'
        };
        layout.yaxis2 = {
            title: 'z (mm)',
            color: theme.accent_color,
            overlaying: 'y',
            side: 'right',
            gridcolor: 'transparent'
        };
        layout.title = { text: 'Input ÿ, Response ẍ, and Displacement z', font: { size: 12, color: theme.font_color } };
    } else if (plotType === 'displacement') {
        layout.yaxis = { title: 'z (mm)', color: '#8b949e', gridcolor: theme.grid_color };
        layout.title = { text: 'Relative Displacement z(t)', font: { size: 12, color: theme.font_color } };
    } else {
        layout.yaxis = { title: 'ẍ (G)', color: '#8b949e', gridcolor: theme.grid_color };
        layout.title = { text: 'Absolute Acceleration ẍ(t)', font: { size: 12, color: theme.font_color } };
    }

    Plotly.newPlot('timeHistoryPlot', traces, layout, { responsive: true });
}

// Prepare animation after switching tabs
function prepareAnimation() {
    computeAnimationHistory();
    resetAnimation();
    drawCurrentFrame();
}

// Draw the SDOF system at current frame - HORIZONTAL WALL-MOUNTED LAYOUT
function drawCurrentFrame() {
    const canvas = document.getElementById('sdofCanvas');
    if (!canvas || !animState.history) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Get theme colors
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const colors = {
        bg: isLight ? '#f6f8fa' : '#161b22',
        primary: isLight ? '#24292f' : '#f0f6fc',
        secondary: isLight ? '#57606a' : '#8b949e',
        accent: isLight ? '#0969da' : '#58a6ff',
        spring: isLight ? '#1a7f37' : '#3fb950',
        damper: isLight ? '#9a6700' : '#d29922',
        mass: isLight ? '#0969da' : '#58a6ff',
        wall: isLight ? '#6e7781' : '#484f58',
        ground: isLight ? '#8b949e' : '#30363d'
    };

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, w, h);

    const frame = animState.currentFrame;
    const hist = animState.history;

    // Get current values
    const z = hist.z[frame] || 0;
    const baseAccel = hist.baseAccel[frame] || 0;
    const baseDisp = hist.baseDisp ? (hist.baseDisp[frame] || 0) : 0;

    // Geometry
    const centerY = h / 2;
    const wallWidth = 25;
    const massSize = 70;
    const groundY = centerY + massSize / 2 + 10;

    // UNIFIED SCALE for both wall displacement and mass relative displacement
    // Use reduce instead of spread to avoid stack overflow with large arrays
    let maxBaseDisp = 0;
    if (hist.baseDisp && hist.baseDisp.length > 0) {
        maxBaseDisp = hist.baseDisp.reduce((max, val) => Math.max(max, Math.abs(val)), 0);
    }
    const maxZ = animState.maxZ || 0.001;

    // Use the larger of the two motions to determine scale
    const maxMotion = Math.max(maxBaseDisp, maxZ, 0.0001); // Prevent division by zero

    // Clamp scale to reasonable range (avoid extreme values for very small motions)
    let unifiedScale = 100 / maxMotion;
    unifiedScale = Math.min(unifiedScale, 1000000); // Cap at reasonable max
    unifiedScale = Math.max(unifiedScale, 0.1);     // Cap at reasonable min

    const scaledBaseDisp = baseDisp * unifiedScale;
    const scaledZ = z * unifiedScale;

    // Clamp displacements to canvas bounds
    const maxDisp = 200; // Max pixels any displacement can move
    const clampedBaseDisp = Math.max(-maxDisp, Math.min(maxDisp, scaledBaseDisp));
    const clampedZ = Math.max(-maxDisp, Math.min(maxDisp, scaledZ));

    // Check if anchor wall mode is enabled
    const anchorWall = document.getElementById('anchorWall')?.checked || false;

    // Positions
    let wallX, massX;
    const springRestLength = 150;

    if (anchorWall) {
        // ANCHOR MODE: Wall is fixed, mass shows RELATIVE motion only
        wallX = 60;
        massX = wallX + springRestLength + clampedZ;
    } else {
        // ABSOLUTE MODE: Wall moves with base displacement, mass shows absolute motion
        wallX = 60 + clampedBaseDisp;
        massX = wallX + springRestLength + clampedZ;
    }

    const massLeft = massX - massSize / 2;
    const massRight = massX + massSize / 2;
    const massTop = centerY - massSize / 2;
    const massBottom = centerY + massSize / 2;

    // Draw ground/rails (hatched)
    ctx.strokeStyle = colors.ground;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, groundY);
    ctx.lineTo(w - 30, groundY);
    ctx.stroke();

    // Hatching for ground
    for (let x = 40; x < w - 30; x += 15) {
        ctx.beginPath();
        ctx.moveTo(x, groundY);
        ctx.lineTo(x - 8, groundY + 10);
        ctx.stroke();
    }

    // Draw wall (moving with base excitation)
    ctx.fillStyle = colors.wall;
    ctx.fillRect(wallX - wallWidth, centerY - 80, wallWidth, 160);
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 2;
    ctx.strokeRect(wallX - wallWidth, centerY - 80, wallWidth, 160);

    // Wall hatching (to indicate fixed/moving boundary)
    ctx.strokeStyle = colors.secondary;
    ctx.lineWidth = 1;
    for (let y = centerY - 75; y < centerY + 75; y += 12) {
        ctx.beginPath();
        ctx.moveTo(wallX - wallWidth, y);
        ctx.lineTo(wallX - wallWidth - 8, y + 8);
        ctx.stroke();
    }

    // Connection points on wall
    const springWallY = centerY - 25;
    const damperWallY = centerY + 25;

    // === Draw Spring (zigzag, horizontal) ===
    const springStartX = wallX;
    const springEndX = massLeft;
    const springLength = springEndX - springStartX;
    const coils = 10;
    const coilWidth = springLength / coils;
    const springAmplitude = 12;

    ctx.strokeStyle = colors.spring;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(springStartX, springWallY);
    for (let i = 0; i < coils; i++) {
        const x1 = springStartX + i * coilWidth;
        const x2 = x1 + coilWidth / 2;
        const x3 = x1 + coilWidth;
        const dir = i % 2 === 0 ? 1 : -1;
        ctx.lineTo(x2, springWallY + dir * springAmplitude);
        ctx.lineTo(x3, springWallY);
    }
    ctx.stroke();

    // Spring label
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.fillStyle = colors.spring;
    ctx.textAlign = 'center';
    ctx.fillText('k', (springStartX + springEndX) / 2, springWallY - 20);

    // === Draw Damper (dashpot, horizontal) ===
    const damperStartX = wallX;
    const damperEndX = massLeft;
    const damperLength = damperEndX - damperStartX;
    const cylinderLength = 40;
    const cylinderHeight = 16;
    const pistonLength = damperLength - cylinderLength - 20;

    ctx.strokeStyle = colors.damper;
    ctx.lineWidth = 3;

    // Rod from wall
    ctx.beginPath();
    ctx.moveTo(damperStartX, damperWallY);
    ctx.lineTo(damperStartX + 15, damperWallY);
    ctx.stroke();

    // Cylinder body
    const cylStartX = damperStartX + 15;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(cylStartX, damperWallY - cylinderHeight / 2, cylinderLength, cylinderHeight);
    ctx.strokeRect(cylStartX, damperWallY - cylinderHeight / 2, cylinderLength, cylinderHeight);

    // Piston rod (extends from cylinder to mass)
    ctx.beginPath();
    ctx.moveTo(cylStartX + cylinderLength, damperWallY);
    ctx.lineTo(damperEndX, damperWallY);
    ctx.stroke();

    // Piston head inside cylinder
    const pistonHeadX = cylStartX + cylinderLength - 8 - Math.min(15, Math.max(-15, scaledZ * 0.3));
    ctx.fillStyle = colors.damper;
    ctx.fillRect(pistonHeadX, damperWallY - cylinderHeight / 2 + 2, 6, cylinderHeight - 4);

    // Damper label
    ctx.fillStyle = colors.damper;
    ctx.fillText('c', (damperStartX + damperEndX) / 2, damperWallY + 28);

    // === Draw Mass ===
    ctx.fillStyle = colors.mass;
    ctx.fillRect(massLeft, massTop, massSize, massSize);
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 2;
    ctx.strokeRect(massLeft, massTop, massSize, massSize);

    // Mass label
    ctx.fillStyle = colors.primary;
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('m', massX, centerY + 6);

    // Small wheels/rollers under mass
    ctx.fillStyle = colors.secondary;
    ctx.beginPath();
    ctx.arc(massLeft + 15, massBottom + 5, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(massRight - 15, massBottom + 5, 6, 0, Math.PI * 2);
    ctx.fill();

    // === Annotations ===

    // Base excitation arrow and label (at wall)
    ctx.strokeStyle = colors.accent;
    ctx.fillStyle = colors.accent;
    ctx.lineWidth = 2;
    const arrowY = centerY - 95;
    const arrowLen = 30 * Math.sign(baseAccel) * Math.min(1, Math.abs(baseAccel) / 5);
    if (Math.abs(arrowLen) > 2) {
        ctx.beginPath();
        ctx.moveTo(wallX - wallWidth / 2, arrowY);
        ctx.lineTo(wallX - wallWidth / 2 + arrowLen, arrowY);
        ctx.stroke();
        // Arrowhead
        const headDir = Math.sign(arrowLen);
        ctx.beginPath();
        ctx.moveTo(wallX - wallWidth / 2 + arrowLen, arrowY);
        ctx.lineTo(wallX - wallWidth / 2 + arrowLen - headDir * 8, arrowY - 4);
        ctx.lineTo(wallX - wallWidth / 2 + arrowLen - headDir * 8, arrowY + 4);
        ctx.closePath();
        ctx.fill();
    }
    ctx.font = '11px Roboto Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`ÿ = ${baseAccel.toFixed(2)}G`, wallX - wallWidth / 2, arrowY - 12);

    // Displacement indicator above mass
    ctx.fillStyle = colors.accent;
    ctx.font = '12px Roboto Mono, monospace';
    const dispText = `z = ${(z * 1000).toFixed(3)} mm`;
    ctx.fillText(dispText, massX, massTop - 15);

    // Draw relative displacement arrow
    if (Math.abs(scaledZ) > 3) {
        const equilibriumMassX = wallX + springRestLength; // Where mass would be at z=0
        const arrowStartX = equilibriumMassX;
        const arrowEndX = massX;
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(arrowStartX, massTop - 5);
        ctx.lineTo(arrowEndX, massTop - 5);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Time indicator (top-left)
    const time = hist.time[frame] * 1000;
    ctx.fillStyle = colors.primary;
    ctx.font = '12px Roboto Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`t = ${time.toFixed(2)} ms`, 15, 25);

    // Frame indicator (top-right)
    ctx.fillStyle = colors.secondary;
    ctx.textAlign = 'right';
    ctx.fillText(`Frame ${frame + 1}/${hist.time.length}`, w - 15, 25);

    // === Draw Load Arrows in Anchor Mode ===
    if (anchorWall && Math.abs(baseAccel) > 0.1) {
        // Arrow direction based on base acceleration
        const arrowDir = baseAccel > 0 ? 1 : -1;
        const arrowLen = Math.min(Math.abs(baseAccel) * 5, 60); // Scale arrow length
        const arrowY = centerY;
        const arrowStartX = wallX - 10;
        const arrowEndX = arrowStartX + (arrowDir * arrowLen);

        ctx.strokeStyle = '#238636'; // Green for input
        ctx.fillStyle = '#238636';
        ctx.lineWidth = 3;

        // Draw arrow shaft
        ctx.beginPath();
        ctx.moveTo(arrowStartX, arrowY);
        ctx.lineTo(arrowEndX, arrowY);
        ctx.stroke();

        // Draw arrowhead
        const headLen = 10;
        ctx.beginPath();
        ctx.moveTo(arrowEndX, arrowY);
        ctx.lineTo(arrowEndX - arrowDir * headLen, arrowY - 6);
        ctx.lineTo(arrowEndX - arrowDir * headLen, arrowY + 6);
        ctx.closePath();
        ctx.fill();

        // Label
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`ÿ = ${baseAccel.toFixed(1)} G`, arrowStartX - 30, arrowY - 15);
    }

    // Legend/key (bottom right)
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = colors.secondary;
    if (anchorWall) {
        ctx.fillText('⚓ Anchor Mode: Wall fixed, arrows show applied load', w - 15, h - 25);
        ctx.fillText('Mass shows RELATIVE displacement z(t)', w - 15, h - 12);
    } else {
        ctx.fillText('Wall motion = Base excitation ÿ(t)', w - 15, h - 25);
        ctx.fillText('Mass motion = Absolute position', w - 15, h - 12);
    }

    // Update time history marker
    updateTimeMarker(time);
}

// Update position marker on time history plot
function updateTimeMarker(timeMs) {
    const plotDiv = document.getElementById('timeHistoryPlot');
    if (!plotDiv || !plotDiv.data) return;

    const theme = getThemeColors();

    Plotly.relayout('timeHistoryPlot', {
        shapes: [{
            type: 'line',
            x0: timeMs,
            x1: timeMs,
            yref: 'paper',
            y0: 0,
            y1: 1,
            line: { color: '#f85149', width: 2, dash: 'dot' }
        }]
    });
}

// Animation loop
function animate() {
    if (!animState.isPlaying || !animState.history) return;

    drawCurrentFrame();

    // Sync timeline scrubber
    const totalFrames = animState.history.time.length;
    const percent = (animState.currentFrame / (totalFrames - 1)) * 100;
    const scrubber = document.getElementById('timelineScrub');
    const scrubTime = document.getElementById('scrubTime');
    if (scrubber) scrubber.value = percent;
    if (scrubTime) {
        const time = animState.history.time[animState.currentFrame] * 1000;
        scrubTime.textContent = time.toFixed(2);
    }

    // Advance frame based on speed
    const frameStep = Math.max(1, Math.floor(animState.speed * 2));
    animState.currentFrame += frameStep;

    if (animState.currentFrame >= animState.history.time.length) {
        animState.currentFrame = 0; // Loop
    }

    animState.animationId = requestAnimationFrame(animate);
}

// Play/Pause toggle
function togglePlayPause() {
    const btn = document.getElementById('playPauseBtn');

    if (animState.isPlaying) {
        animState.isPlaying = false;
        cancelAnimationFrame(animState.animationId);
        btn.textContent = '▶ Play';
    } else {
        animState.isPlaying = true;
        btn.textContent = '⏸ Pause';
        animate();
    }
}

// Reset animation
function resetAnimation() {
    const wasPlaying = animState.isPlaying;

    // Reset to frame 0
    animState.currentFrame = 0;
    cancelAnimationFrame(animState.animationId);

    // Update scrubber position
    const scrubber = document.getElementById('timelineScrub');
    const scrubTime = document.getElementById('scrubTime');
    if (scrubber) scrubber.value = 0;
    if (scrubTime) scrubTime.textContent = '0.00';

    // If was playing, continue playing from the start
    if (wasPlaying) {
        animState.isPlaying = true;
        animate();
    } else {
        animState.isPlaying = false;
        const btn = document.getElementById('playPauseBtn');
        if (btn) btn.textContent = '▶ Play';
        drawCurrentFrame();
    }
}

// Modify the original calculateSRS to store pulse data
const originalPlotResults = plotResults;
plotResults = function (freqs, srs, timeVector, pulseVector, type, amp, dur) {
    // Call original
    originalPlotResults(freqs, srs, timeVector, pulseVector, type, amp, dur);

    // Store for animation
    const qFactor = parseFloat(document.getElementById('qFactor').value) || 10;
    storePulseData(timeVector, pulseVector, qFactor);
};
