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
      currentRate: parse("current-rate", 0, 10000, 0),
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
   *   bufferPerHour: number,
   *   ratePerDay: number,
   *   ratePerWeek: number,
   *   ratePerMonth: number,
   *   currentRate: number,
   *   annualGap: number|null
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
      currentRate,
    } = inputs;

    const grossNeeded = takeHome / (1 - taxRate / 100);
    const totalOverhead =
      softwareCost + hardwareCost + insuranceCost + otherCost;
    const totalCost = grossNeeded + totalOverhead;
    const billableHours = weeksPerYear * hoursPerWeek * (billablePercent / 100);

    const survivalRate = billableHours > 0 ? totalCost / billableHours : 0;
    const bufferPerHour = survivalRate * (growthBuffer / 100);
    const growthRate = survivalRate + bufferPerHour;

    // Alt period rates based on growth rate
    const billableHoursPerWeek = hoursPerWeek * (billablePercent / 100);
    const ratePerDay = growthRate * 8;
    const ratePerWeek = growthRate * billableHoursPerWeek;
    const ratePerMonth = (ratePerWeek * weeksPerYear) / 12;

    // Current rate gap
    const annualGap =
      currentRate > 0
        ? (growthRate - currentRate) * billableHours
        : null;

    return {
      grossNeeded,
      totalOverhead,
      totalCost,
      billableHours,
      survivalRate,
      growthRate,
      bufferPerHour,
      ratePerDay,
      ratePerWeek,
      ratePerMonth,
      currentRate,
      annualGap,
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
   * Updates the rate gauge bar and markers.
   * @param {number} survivalRate
   * @param {number} growthRate
   * @param {number} currentRate - 0 means not entered.
   */
  function updateGauge(survivalRate, growthRate, currentRate) {
    const MAX_RATE = 200;
    const fill = document.getElementById("gauge-fill");
    const survivalMarker = document.getElementById("gauge-survival-marker");
    const growthMarker = document.getElementById("gauge-growth-marker");
    const currentMarker = document.getElementById("gauge-current-marker");
    const currentLabel = document.getElementById("gauge-current-label");

    /** @param {number} rate @return {number} */
    const toPct = (rate) =>
      Math.min(100, Math.max(0, (rate / MAX_RATE) * 100));

    if (fill) {
      fill.style.width = `${toPct(growthRate)}%`;
    }
    if (survivalMarker) {
      survivalMarker.style.left = `${toPct(survivalRate)}%`;
    }
    if (growthMarker) {
      growthMarker.style.left = `${toPct(growthRate)}%`;
    }
    if (currentMarker && currentLabel) {
      if (currentRate > 0) {
        currentMarker.hidden = false;
        currentLabel.hidden = false;
        currentMarker.style.left = `${toPct(currentRate)}%`;
      } else {
        currentMarker.hidden = true;
        currentLabel.hidden = true;
      }
    }
  }

  /**
   * Updates all output elements with the latest calculated results.
   */
  function updateOutput() {
    const inputs = getInputs();
    const result = calculate(inputs);

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    const survivalEl = document.getElementById("survival-rate");
    const growthEl = document.getElementById("growth-rate");

    if (survivalEl) {
      survivalEl.innerHTML = `${formatRate(result.survivalRate)}<span class="results__card-unit">/hr</span>`;
    }
    if (growthEl) {
      growthEl.innerHTML = `${formatRate(result.growthRate)}<span class="results__card-unit">/hr</span>`;
    }

    // Breakdown
    setText("breakdown-gross", formatDollars(result.grossNeeded));
    setText("breakdown-overhead", formatDollars(result.totalOverhead));
    setText("breakdown-total-cost", formatDollars(result.totalCost));
    setText(
      "breakdown-billable-hours",
      `${Math.round(result.billableHours).toLocaleString()} hrs`,
    );
    setText("breakdown-survival", `${formatRate(result.survivalRate)}/hr`);
    setText("breakdown-buffer", `+${formatRate(result.bufferPerHour)}/hr`);

    // Gauge
    updateGauge(result.survivalRate, result.growthRate, result.currentRate);

    // Rate gap card
    const gapCard = document.getElementById("rate-gap-card");
    if (gapCard) {
      if (result.annualGap !== null) {
        gapCard.hidden = false;
        const hourlyGap = result.growthRate - result.currentRate;
        const gapLabel = document.getElementById("rate-gap-label");
        const gapValue = document.getElementById("rate-gap-value");
        const gapDesc = document.getElementById("rate-gap-desc");
        if (hourlyGap > 0) {
          if (gapLabel) gapLabel.textContent = "Undercharging by";
          if (gapValue) gapValue.textContent = `${formatRate(hourlyGap)}/hr`;
          if (gapDesc) {
            gapDesc.textContent = `That's ${formatDollars(Math.abs(result.annualGap))} left on the table per year.`;
          }
          if (gapCard) gapCard.dataset.status = "under";
        } else if (hourlyGap < 0) {
          if (gapLabel) gapLabel.textContent = "Charging above growth rate by";
          if (gapValue) gapValue.textContent = `${formatRate(Math.abs(hourlyGap))}/hr`;
          if (gapDesc) {
            gapDesc.textContent = `You're pricing above your growth rate. Strong position.`;
          }
          if (gapCard) gapCard.dataset.status = "over";
        } else {
          if (gapLabel) gapLabel.textContent = "Right on target";
          if (gapValue) gapValue.textContent = `${formatRate(result.currentRate)}/hr`;
          if (gapDesc) gapDesc.textContent = `Your current rate matches your growth rate exactly.`;
          if (gapCard) gapCard.dataset.status = "on";
        }
      } else {
        gapCard.hidden = true;
      }
    }

    // Period rates
    setText("rate-per-day", formatDollars(result.ratePerDay));
    setText("rate-per-week", formatDollars(result.ratePerWeek));
    setText("rate-per-month", formatDollars(result.ratePerMonth));

    // Share button
    const shareBtn = document.getElementById("share-btn");
    if (shareBtn) {
      const tweetText = [
        `My freelance rates: Survival ${formatRate(result.survivalRate)}/hr | Growth ${formatRate(result.growthRate)}/hr`,
        `Monthly equivalent: ${formatDollars(result.ratePerMonth)}`,
        `Are you charging enough?`,
        `freelanceratewise.com`,
      ].join("\n");
      shareBtn.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    }

    // Copy button
    const copyBtn = document.getElementById("copy-btn");
    if (copyBtn && !copyBtn.dataset.bound) {
      copyBtn.dataset.bound = "true";
      copyBtn.addEventListener("click", () => {
        const lines = [
          "FreelanceRateWise Results",
          `Survival Rate:  ${formatRate(result.survivalRate)}/hr`,
          `Growth Rate:    ${formatRate(result.growthRate)}/hr`,
          "",
          `Per Day:   ${formatDollars(result.ratePerDay)}`,
          `Per Week:  ${formatDollars(result.ratePerWeek)}`,
          `Per Month: ${formatDollars(result.ratePerMonth)}`,
          "",
          `Billable Hours/yr: ${Math.round(result.billableHours).toLocaleString()}`,
          `Total Annual Cost: ${formatDollars(result.totalCost)}`,
        ];
        if (result.annualGap !== null) {
          const hourlyGap = result.growthRate - result.currentRate;
          lines.push("");
          lines.push(
            hourlyGap > 0
              ? `Leaving on table: ${formatDollars(Math.abs(result.annualGap))}/yr`
              : `Above growth rate: ${formatRate(Math.abs(hourlyGap))}/hr`,
          );
        }
        navigator.clipboard
          .writeText(lines.join("\n"))
          .then(() => {
            copyBtn.textContent = "Copied!";
            copyBtn.classList.add("copy-btn--success");
            setTimeout(() => {
              copyBtn.textContent = "Copy Results";
              copyBtn.classList.remove("copy-btn--success");
            }, 2000);
          })
          .catch(() => {
            copyBtn.textContent = "Copy unavailable";
          });
      });
    }
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
