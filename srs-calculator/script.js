document.addEventListener('DOMContentLoaded', () => {
    const calculateBtn = document.getElementById('calculateBtn');

    // Initial Calc
    calculateSRS();

    calculateBtn.addEventListener('click', calculateSRS);

    // Live Update Listeners
    const inputs = ['pulseType', 'amplitude', 'duration', 'qFactor'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        // Use 'input' for real-time updates while typing, 'change' for verify
        el.addEventListener('input', calculateSRS);
        el.addEventListener('change', calculateSRS);
    });
});

function calculateSRS() {
    // 1. Get Inputs
    const pulseType = document.getElementById('pulseType').value;
    const amplitude = parseFloat(document.getElementById('amplitude').value);
    const duration = parseFloat(document.getElementById('duration').value); // ms
    const qFactor = parseFloat(document.getElementById('qFactor').value);
    const dampingRatio = 1 / (2 * qFactor);

    if (isNaN(amplitude) || isNaN(duration) || isNaN(qFactor)) {
        alert("Please check your inputs.");
        return;
    }

    const durationSec = duration / 1000.0;

    // 2. Generate Pulse Time History
    // We need a sampling rate high enough for the highest frequency of interest in the SRS.
    // Typically SRS goes up to 2000Hz or 10000Hz.
    // Let's assume max freq we care about is 10,000 Hz.
    // Fs should be at least 10x fmax for good integration stability? 
    // Actually, for half-sine pulse of duration T, the frequency content is mainly below 1/T.
    // But SRS needs to calculate response at high freq.
    // Let's pick a fixed dt small enough. 100k samples/sec = 1e-5 sec.

    const fMAX_SRS = 2000; // Hz - typical for standard shock specs
    const dt = 1 / (20 * fMAX_SRS); // Over-sample to ensure stability

    // Total time for simulation. Pulse is Td. 
    // Response decay takes time. We should simulate for enough time to see the peak response.
    // For damping Q=10, decay takes a while. 
    // Duration + 5 * TimeConstant of system?
    // Let's iterate until T_total = T_pulse or more. 
    // Actually SDOF response often peaks during the pulse for low freq, and after for high Q? 
    // Let's simulate for 5 * duration or 0.1 sec, whichever is longer.

    let simDuration = Math.max(5 * durationSec, 0.1);

    const timeVector = [];
    const accelVector = [];
    const numSteps = Math.ceil(simDuration / dt);

    for (let i = 0; i <= numSteps; i++) {
        const t = i * dt;
        timeVector.push(t);
        accelVector.push(getPulseAcceleration(t, pulseType, amplitude, durationSec));
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
    plotResults(freqs, srsMaxAbsAccel, timeVector, accelVector, pulseType, amplitude, duration);
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
    // 1. Plot SRS
    const srsTrace = {
        x: freqs,
        y: srs,
        mode: 'lines+markers',
        type: 'scatter',
        name: `SRS (Q=10)`,
        line: { color: '#58a6ff', width: 3 },
        marker: { size: 6 }
    };

    const srsLayout = {
        title: {
            text: `Shock Response Spectrum (Q=10)`,
            font: { color: '#f0f6fc' }
        },
        paper_bgcolor: '#161b22',
        plot_bgcolor: '#161b22',
        xaxis: {
            type: 'log',
            title: 'Natural Frequency (Hz)',
            color: '#8b949e',
            gridcolor: '#30363d'
        },
        yaxis: {
            type: 'log',
            title: 'Peak Absolute Acceleration (G)',
            color: '#8b949e',
            gridcolor: '#30363d'
        },
        showlegend: false,
        margin: { t: 40, r: 30, l: 60, b: 50 }
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

    const pulseLayout = {
        title: {
            text: `Input Pulse: ${type} (${amp}G, ${dur}ms)`,
            font: { color: '#f0f6fc', size: 14 }
        },
        paper_bgcolor: '#161b22',
        plot_bgcolor: '#161b22',
        xaxis: {
            title: 'Time (ms)',
            color: '#8b949e',
            gridcolor: '#30363d'
        },
        yaxis: {
            title: 'Acceleration (G)',
            color: '#8b949e',
            gridcolor: '#30363d'
        },
        showlegend: false,
        margin: { t: 40, r: 30, l: 60, b: 40 }
    };

    Plotly.newPlot('pulsePlotDiv', [pulseTrace], pulseLayout, config);
}
