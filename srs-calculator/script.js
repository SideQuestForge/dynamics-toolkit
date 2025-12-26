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
    calculateSRS();

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

function handleInput(e) {
    const pulseType = document.getElementById('pulseType').value;
    const fileGroup = document.getElementById('fileGroup');
    const ampGroup = document.getElementById('ampGroup');
    const durGroup = document.getElementById('durGroup');

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
        timeVector = customData.time;
        accelVector = customData.accel;
        displayAmp = customData.name || 'Custom CSV';
        displayDur = '';

        // Calculate average dt
        if (timeVector.length > 1) {
            dt = (timeVector[timeVector.length - 1] - timeVector[0]) / (timeVector.length - 1);
        } else {
            return;
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
