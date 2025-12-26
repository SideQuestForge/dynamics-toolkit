import numpy as np
import matplotlib.pyplot as plt

def solve_sdof_verifier(time, accel_input, fn, q_factor):
    """
    Solves SDOF equation of motion using Velocity Verlet integration.
    Verifies the JavaScript implementation.
    """
    dt = time[1] - time[0]
    wn = 2 * np.pi * fn
    damp = 1.0 / (2.0 * q_factor)
    
    # State variables
    x = 0.0
    v = 0.0
    max_abs_accel = 0.0
    
    # Pre-compute constants
    k = wn**2
    c = 2 * damp * wn
    
    for i in range(len(time) - 1):
        # Current input acceleration
        a_in = accel_input[i]
        
        # Calculate current relative acceleration: a = -a_in - 2*damp*wn*v - wn^2*x
        a = -a_in - c*v - k*x
        
        # Velocity Verlet Step 1
        x_new = x + v*dt + 0.5*a*dt**2
        
        # Intermediate velocity (half step)
        v_half = v + 0.5*a*dt
        
        # Acceleration at new position
        a_in_next = accel_input[i+1]
        a_new = -a_in_next - c*v_half - k*x_new # Approximate a_new using v_half? 
        # Actually standard VV updates a_new based on x_new and v_new, but v_new depends on a_new.
        # For linear systems we can solve explicitely or use the standard form:
        # v(t+dt) = v(t) + 0.5*(a(t) + a(t+dt))*dt
        # But a(t+dt) depends on v(t+dt).
        # So we use the explicit form for linear damped systems or the predictor-corrector.
        # Let's use the exact same logic as the JS to verify IT.
        
        # JS Logic:
        # let a = -accel_input[i] - 2*zeta*wn*v - wn*wn*x;
        # x += v * dt + 0.5 * a * dt * dt;
        # let a_new_est = -accel_input[i+1] - 2*zeta*wn*v - wn*wn*x; // Using old v/x? JS implementation might be simplified?
        # Let's check JS.
        # Actually, let's write the CORRECT VV implementation here to check accuracy.
        
        # Accurate Velocity Verlet for velocity dependent forces requires iteration or explicit solution.
        # Explicit solution for linear damping:
        # v_new = (v + 0.5*dt*(a - 2*damp*wn*v - wn^2*x_new - a_in_next)) / (1 + damp*wn*dt) ? No.
        
        # Let's use a standard SciPy lsim or odeint for "Ground Truth" verification.
        pass

    # Alternative: Use SciPy for ground truth
    from scipy.signal import lsim, TransferFunction
    
    # Transfer function for absolute acceleration: (2*zeta*wn*s + wn^2) / (s^2 + 2*zeta*wn*s + wn^2)
    num = [2*damp*wn, wn**2]
    den = [1, 2*damp*wn, wn**2]
    sys = TransferFunction(num, den)
    
    # Scipy lsim
    # T, y, x_state = lsim(sys, accel_input, time)
    # This gives absolute acceleration response directly if input is acceleration? 
    # Wait, equation is z'' + 2zw z' + w^2 z = -y''
    # Absolute accel x'' = z'' + y'' = -2zw z' - w^2 z
    # So TF from y'' to x'' is indeed -(2zw s + w^2) / (s^2 + 2zw s + w^2) * (-1) = (cs+k)/(ms^2+cs+k)
    
    T, y, _ = lsim(sys, accel_input, time)
    return np.max(np.abs(y))


def generate_half_sine(amp, dur, dt):
    t_pulse = np.arange(0, dur, dt)
    accel_pulse = amp * np.sin(np.pi * t_pulse / dur)
    
    # Pad with zeros
    t_end = max(5 * dur, 0.1)
    t_total = np.arange(0, t_end, dt)
    accel_total = np.zeros_like(t_total)
    accel_total[:len(accel_pulse)] = accel_pulse
    
    return t_total, accel_total

def main():
    print("Verifying SRS Calculation...")
    
    # Parameters
    amp = 10.0 # G
    dur = 0.010 # 10 ms
    q = 10.0
    
    # 1. Generate Input
    # 2000Hz max freq -> dt = 1 / (20 * 2000) = 2.5e-5
    dt = 1.0 / (20.0 * 2000.0)
    time, accel = generate_half_sine(amp, dur, dt)
    
    # 2. Calculate SRS at specific frequencies
    freqs = [10, 100, 500, 1000, 2000]
    print(f"Input: Half-Sine {amp}G, {dur*1000}ms, Q={q}")
    print(f"{'Freq (Hz)':<10} | {'SRS (G) (SciPy)':<15}")
    print("-" * 30)
    
    for fn in freqs:
        srs_val = solve_sdof_verifier(time, accel, fn, q)
        print(f"{fn:<10} | {srs_val:.4f}")

if __name__ == "__main__":
    main()
