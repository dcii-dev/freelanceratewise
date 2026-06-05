(function () {
  "use strict";

  /* ================================
     THEME
     ================================ */

  /**
   * Applies a theme to the document root and updates the toggle button state.
   * @param {string} theme - Either "light" or "dark".
   */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    const isDark = theme === "dark";
    btn.setAttribute("aria-pressed", String(isDark));
    btn.setAttribute(
      "aria-label",
      isDark ? "Switch to light mode" : "Switch to dark mode",
    );
  }

  /**
   * Reads the stored theme from localStorage, falls back to OS preference.
   */
  function initializeTheme() {
    const stored = localStorage.getItem("freelanceratewise-theme");
    if (stored === "dark" || stored === "light") {
      applyTheme(stored);
      return;
    }
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    applyTheme(prefersDark ? "dark" : "light");
  }

  /**
   * Toggles between light and dark theme, persisting the choice.
   */
  function toggleTheme() {
    const current =
      document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem("freelanceratewise-theme", next);
    applyTheme(next);
  }

  /* ================================
     CALCULATOR LOGIC
     ================================ */

  /**
   * Reads and parses all calculator inputs from the DOM.
   * @return {{
   *   takeHome: number,
   *   taxRate: number,
   *   weeksPerYear: number,
   *   hoursPerWeek: number,
   *   billablePercent: number,
   *   softwareCost: number,
   *   hardwareCost: number,
   *   insuranceCost: number,
   *   otherCost: number,
   *   growthBuffer: number
   * }}
   */
  function getInputs() {
    /**
     * Parses a DOM input by id, returning a float clamped to [min, max].
     * @param {string} id - The element id.
     * @param {number} min - Minimum allowed value.
     * @param {number} max - Maximum allowed value.
     * @param {number} fallback - Value to use if input is empty or NaN.
     * @return {number}
     */
    const parse = (id, min, max, fallback) => {
      const el = document.getElementById(id);
      const val = el ? parseFloat(el.value) : NaN;
      if (isNaN(val)) return fallback;
      return Math.max(min, Math.min(max, val));
    };

    return {
      takeHome: parse("target-income", 0, 10_000_000, 60000),
      taxRate: parse("tax-rate", 0, 99, 28),
      weeksPerYear: parse("weeks-per-year", 1, 52, 48),
      hoursPerWeek: parse("hours-per-week", 1, 168, 40),
      billablePercent: parse("billable-percent", 1, 100, 70),
      softwareCost: parse("software-cost", 0, 1_000_000, 0),
      hardwareCost: parse("hardware-cost", 0, 1_000_000, 0),
      insuranceCost: parse("insurance-cost", 0, 1_000_000, 0),
      otherCost: parse("other-cost", 0, 1_000_000, 0),
      growthBuffer: parse("growth-buffer", 0, 100, 10),
    };
  }

  /**
   * Runs the core rate calculation from parsed inputs.
   * @param {{
   *   takeHome: number,
   *   taxRate: number,
   *   weeksPerYear: number,
   *   hoursPerWeek: number,
   *   billablePercent: number,
   *   softwareCost: number,
   *   hardwareCost: number,
   *   insuranceCost: number,
   *   otherCost: number,
   *   growthBuffer: number
   * }} inputs
   * @return {{
   *   grossNeeded: number,
   *   totalOverhead: number,
   *   totalCost: number,
   *   billableHours: number,
   *   survivalRate: number,
   *   growthRate: number,
   *   bufferPerHour: number
   * }}
   */
  function calculate(inputs) {
    const {
      takeHome,
      taxRate,
      weeksPerYear,
      hoursPerWeek,
      billablePercent,
      softwareCost,
      hardwareCost,
      insuranceCost,
      otherCost,
      growthBuffer,
    } = inputs;

    const grossNeeded = takeHome / (1 - taxRate / 100);
    const totalOverhead =
      softwareCost + hardwareCost + insuranceCost + otherCost;
    const totalCost = grossNeeded + totalOverhead;
    const billableHours = weeksPerYear * hoursPerWeek * (billablePercent / 100);

    const survivalRate = billableHours > 0 ? totalCost / billableHours : 0;
    const bufferPerHour = survivalRate * (growthBuffer / 100);
    const growthRate = survivalRate + bufferPerHour;

    return {
      grossNeeded,
      totalOverhead,
      totalCost,
      billableHours,
      survivalRate,
      growthRate,
      bufferPerHour,
    };
  }

  /**
   * Formats a number as a USD dollar string with no decimals.
   * @param {number} value
   * @return {string}
   */
  function formatDollars(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }

  /**
   * Formats a number as a dollar-per-hour string (e.g. "$42").
   * @param {number} value
   * @return {string}
   */
  function formatRate(value) {
    return `$${Math.ceil(value)}`;
  }

  /**
   * Updates all output elements with the latest calculated results.
   */
  function updateOutput() {
    const inputs = getInputs();
    const result = calculate(inputs);

    const survivalEl = document.getElementById("survival-rate");
    const growthEl = document.getElementById("growth-rate");

    if (survivalEl) {
      survivalEl.innerHTML = `${formatRate(result.survivalRate)}<span class="results__card-unit">/hr</span>`;
    }
    if (growthEl) {
      growthEl.innerHTML = `${formatRate(result.growthRate)}<span class="results__card-unit">/hr</span>`;
    }

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText("breakdown-gross", formatDollars(result.grossNeeded));
    setText("breakdown-overhead", formatDollars(result.totalOverhead));
    setText("breakdown-total-cost", formatDollars(result.totalCost));
    setText(
      "breakdown-billable-hours",
      `${Math.round(result.billableHours).toLocaleString()} hrs`,
    );
    setText("breakdown-survival", `${formatRate(result.survivalRate)}/hr`);
    setText("breakdown-buffer", `+${formatRate(result.bufferPerHour)}/hr`);
  }

  /* ================================
     FOOTER YEAR
     ================================ */

  /**
   * Sets the current year in the footer copyright span.
   */
  function setFooterYear() {
    const el = document.getElementById("footer-year");
    if (el) el.textContent = new Date().getFullYear();
  }

  /* ================================
     INIT
     ================================ */

  /**
   * Bootstraps all interactive components.
   */
  function initializeApp() {
    initializeTheme();
    setFooterYear();
    updateOutput();

    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", toggleTheme);
    }

    const form = document.getElementById("rate-form");
    if (form) {
      form.addEventListener("input", updateOutput);
    }
  }

  if (document.readyState === "complete") {
    initializeApp();
  } else {
    window.addEventListener("load", initializeApp, { once: true });
  }
})();
