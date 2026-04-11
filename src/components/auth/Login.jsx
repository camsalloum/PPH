import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import { SALES_ROLES, MES_ONLY_ROLES, isQCUser } from '../../utils/roleConstants';
import './Login.css';

const getLandingRoute = (nextUser) => {
  if (nextUser?.isPlatformAdmin) return '/platform';
  if (nextUser?.role === 'admin' || nextUser?.role === 'manager') return '/modules';
  if (SALES_ROLES.includes(nextUser?.role)) return '/crm';
  if (MES_ONLY_ROLES.includes(nextUser?.role)) return '/mes';
  // Legacy 'user' role with QC department/designation — send straight to MES
  if (isQCUser(nextUser)) return '/mes';
  return '/modules';
};

const Login = () => {
  const navigate = useNavigate();
  const { login, loading, error, isAuthenticated, user } = useAuth();
  const { loadThemeFromServer } = useTheme();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [localError, setLocalError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [loginState, setLoginState] = useState('idle');
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);

  // Advanced particle system with Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    class Particle {
      constructor() {
        this.reset();
      }

      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 3 + 1;
        this.speedX = Math.random() * 0.5 - 0.25;
        this.speedY = Math.random() * 0.5 - 0.25;
        this.opacity = Math.random() * 0.5 + 0.2;
        this.hue = Math.random() * 60 + 200; // Blue to purple range
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;

        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
          this.reset();
        }
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${this.hue}, 80%, 60%, ${this.opacity})`;
        ctx.fill();
        
        // Add glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = `hsla(${this.hue}, 100%, 60%, ${this.opacity})`;
      }
    }

    const particles = Array.from({ length: 150 }, () => new Particle());
    
    function animate() {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.forEach(particle => {
        particle.update();
        particle.draw();
      });

      requestAnimationFrame(animate);
    }

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Advanced mouse tracking with momentum
  useEffect(() => {
    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;

    const handleMouseMove = (e) => {
      targetX = e.clientX;
      targetY = e.clientY;
    };

    const updatePosition = () => {
      currentX += (targetX - currentX) * 0.1;
      currentY += (targetY - currentY) * 0.1;
      setMousePosition({ x: currentX, y: currentY });
      requestAnimationFrame(updatePosition);
    };

    window.addEventListener('mousemove', handleMouseMove);
    updatePosition();

    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(getLandingRoute(user), { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setLocalError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (!formData.email || !formData.password) {
      setLocalError('Please enter both email and password');
      return;
    }

    setLoginState('authenticating');

    const result = await login(formData.email, formData.password);
    
    if (result.success) {
      setLoginState('success');
      // Load theme in background; do not block navigation
      loadThemeFromServer().catch(() => {});

      navigate(getLandingRoute(result.user), { replace: true });
    } else {
      setLoginState('error');
      setLocalError(result.error);
      setTimeout(() => setLoginState('idle'), 400);
    }
  };

  return (
    <div className="login-page">
      {/* Canvas particle system */}
      <canvas ref={canvasRef} className="particle-canvas" />

      {/* Animated background with 3D perspective */}
      <div className="login-background">
        {/* 3D Rotating Rings */}
        <div className="rings-container">
          {[1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className={`ring ring-${i}`}
              animate={{
                rotateX: [0, 360],
                rotateY: [0, 360],
              }}
              transition={{
                duration: 20 + i * 5,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          ))}
        </div>

        {/* Gradient Orbs with advanced parallax */}
        <motion.div 
          className="gradient-orb orb-1"
          animate={{
            x: mousePosition.x * 0.03,
            y: mousePosition.y * 0.03,
          }}
          transition={{ type: 'spring', stiffness: 30, damping: 30 }}
        />
        <motion.div 
          className="gradient-orb orb-2"
          animate={{
            x: mousePosition.x * -0.02,
            y: mousePosition.y * -0.02,
          }}
          transition={{ type: 'spring', stiffness: 30, damping: 30 }}
        />
        <motion.div 
          className="gradient-orb orb-3"
          animate={{
            x: mousePosition.x * 0.015,
            y: mousePosition.y * 0.015,
          }}
          transition={{ type: 'spring', stiffness: 30, damping: 30 }}
        />

        {/* Mesh gradient background */}
        <div className="mesh-gradient" />

        {/* Animated grid with perspective */}
        <div className="grid-3d" />
      </div>

      {/* Top Logo with glass effect */}
      <motion.div 
        className="login-top-logo"
        initial={{ opacity: 0, y: -30, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ 
          duration: 1, 
          delay: 0.2,
          type: "spring",
          stiffness: 100
        }}
      >
        <div className="logo-glow-wrapper">
          <img 
            src="/uploads/logos/PPH%20without%20BG.png" 
            alt="ProPackHub" 
          />
        </div>
      </motion.div>

      {/* Success State */}
      <AnimatePresence mode="wait">
        {loginState === 'success' && (
          <motion.div
            key="success"
            className="login-success-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="success-content"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
            >
              {/* Animated checkmark */}
              <motion.div 
                className="success-checkmark"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
              >
                <svg viewBox="0 0 52 52">
                  <motion.circle 
                    cx="26" 
                    cy="26" 
                    r="25" 
                    fill="none" 
                    stroke="white" 
                    strokeWidth="2"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                  />
                  <motion.path 
                    fill="none" 
                    stroke="white" 
                    strokeWidth="3" 
                    d="M14 27l7 7 16-16"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.4, delay: 0.6 }}
                  />
                </svg>
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
              >
                Welcome Back!
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
              >
                Redirecting to your dashboard...
              </motion.p>
            </motion.div>

            {/* Ripple effects */}
            {[...Array(4)].map((_, i) => (
              <motion.div
                key={i}
                className="success-ripple"
                initial={{ scale: 0, opacity: 0.6 }}
                animate={{ scale: 4, opacity: 0 }}
                transition={{ duration: 2, delay: i * 0.2 }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Login Container */}
      <AnimatePresence mode="wait">
        {loginState !== 'success' && (
          <motion.div
            className="login-container-advanced"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
          >
            {/* Glass morphism container */}
            <div className="glass-container">
              {/* Left Panel - Form */}
              <motion.div 
                className="form-panel"
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.6 }}
              >
                <motion.div
                  className="form-content"
                  animate={loginState === 'authenticating' ? { scale: 0.98 } : { scale: 1 }}
                >
                  {/* Header */}
                  <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <h2 className="form-title">
                      <span className="gradient-text">Sign In</span>
                    </h2>
                    <p className="form-subtitle">Access your PEBI dashboard</p>
                  </motion.div>

                  {/* Error Message */}
                  <AnimatePresence>
                    {localError && (
                      <motion.div
                        className="error-message-advanced"
                        initial={{ opacity: 0, y: -10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.9 }}
                        transition={{ duration: 0.3 }}
                      >
                        <span className="error-icon">⚠️</span>
                        <span>{localError}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Login Form */}
                  <form onSubmit={handleSubmit}>
                    {/* Email Input */}
                    <motion.div 
                      className={`input-wrapper ${focusedField === 'email' ? 'focused' : ''} ${formData.email ? 'has-value' : ''}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 }}
                    >
                      <div className="input-glow" />
                      <div className="input-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        onFocus={() => setFocusedField('email')}
                        onBlur={() => setFocusedField(null)}
                        placeholder="Enter your email"
                        disabled={loginState === 'authenticating'}
                      />
                      <label>Email Address</label>
                      <div className="input-border" />
                    </motion.div>

                    {/* Password Input */}
                    <motion.div 
                      className={`input-wrapper ${focusedField === 'password' ? 'focused' : ''} ${formData.password ? 'has-value' : ''}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.7 }}
                    >
                      <div className="input-glow" />
                      <div className="input-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField(null)}
                        placeholder="Enter your password"
                        disabled={loginState === 'authenticating'}
                      />
                      <label>Password</label>
                      <button
                        type="button"
                        className="toggle-password"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                      <div className="input-border" />
                    </motion.div>

                    {/* Submit Button */}
                    <motion.button
                      type="submit"
                      className="submit-btn-advanced"
                      disabled={loginState === 'authenticating'}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.8 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className="btn-content">
                        {loginState === 'authenticating' ? (
                          <>
                            <motion.div
                              className="spinner"
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            />
                            <span>Authenticating...</span>
                          </>
                        ) : (
                          <>
                            <span>Sign In</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </>
                        )}
                      </span>
                      <div className="btn-shine" />
                    </motion.button>

                    {/* Contact Admin */}
                    <motion.div
                      className="contact-admin"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.9 }}
                    >
                      Need help? <a href="mailto:admin@propackhub.com">Contact Admin</a>
                    </motion.div>
                  </form>
                </motion.div>
              </motion.div>

              {/* Right Panel - Brand Info */}
              <motion.div 
                className="brand-panel"
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.6 }}
              >
                <div className="brand-content">
                  {/* PEBI Logo Animation */}
                  <motion.div
                    className="pebi-logo-container"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.6, type: "spring", stiffness: 150 }}
                  >
                    <div className="pebi-logo">
                      <span className="pebi-letter">P</span>
                      <span className="pebi-letter">E</span>
                      <span className="pebi-letter">B</span>
                      <span className="pebi-letter">I</span>
                    </div>
                    <div className="logo-glow-effect" />
                  </motion.div>

                  {/* Tagline with highlighted first letters */}
                  <motion.div
                    className="brand-tagline"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                  >
                    <span className="tagline-line">
                      <span className="highlight-letter">P</span>ackaging{' '}
                      <span className="highlight-letter">E</span>nterprise
                    </span>
                    <span className="tagline-line tagline-strong">
                      <span className="highlight-letter">B</span>usiness{' '}
                      <span className="highlight-letter">I</span>ntelligence
                    </span>
                  </motion.div>

                  {/* Feature badges */}
                  <motion.div
                    className="feature-badges"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                  >
                    <span className="feature-tag">MIS/IMS</span>
                    <span className="feature-divider">•</span>
                    <span className="feature-tag">MES</span>
                    <span className="feature-divider">•</span>
                    <span className="feature-tag">CRM</span>
                    <span className="feature-divider">•</span>
                    <span className="feature-tag">AI Chat</span>
                  </motion.div>

                  {/* 3D Visualization */}
                  <div className="data-visualization">
                    {/* Animated Chart */}
                    <svg className="chart-svg" viewBox="0 0 200 100">
                      <defs>
                        <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="rgba(59,130,246,0.6)" />
                          <stop offset="100%" stopColor="rgba(59,130,246,0)" />
                        </linearGradient>
                      </defs>
                      
                      <motion.path
                        d="M0,80 Q50,20 100,40 T200,30"
                        fill="url(#chartGradient)"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 2, delay: 1.2 }}
                      />
                      
                      <motion.path
                        d="M0,80 Q50,20 100,40 T200,30"
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="2"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 2, delay: 1.2 }}
                      />

                      {/* Animated dots */}
                      {[50, 100, 150].map((x, i) => (
                        <motion.circle
                          key={i}
                          cx={x}
                          cy={i === 1 ? 40 : i === 0 ? 20 : 35}
                          r="4"
                          fill="#3b82f6"
                          initial={{ scale: 0 }}
                          animate={{ scale: [0, 1.5, 1] }}
                          transition={{ delay: 1.4 + i * 0.2, duration: 0.5 }}
                        />
                      ))}
                    </svg>
                  </div>

                  {/* Decorative elements */}
                  <div className="decorative-elements">
                    {[...Array(6)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="floating-dot"
                        style={{
                          left: `${20 + i * 15}%`,
                          top: `${30 + (i % 2) * 40}%`,
                        }}
                        animate={{
                          y: [0, -20, 0],
                          opacity: [0.3, 1, 0.3],
                        }}
                        transition={{
                          duration: 3 + i * 0.5,
                          repeat: Infinity,
                          delay: i * 0.3,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <motion.footer
        className="login-footer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        <p>© 2026 ProPackHub • PEBI - Packaging Enterprise Business Intelligence</p>
      </motion.footer>
    </div>
  );
};

export default Login;
