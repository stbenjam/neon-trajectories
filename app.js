(() => {
  const META = window.NEON_ARCHIVE_META;
  const ALL_QUOTES = window.NEON_QUOTES || [];

  const scrollTrack = document.getElementById("scrollTrack");
  const slidesViewport = document.getElementById("slidesViewport");
  const snapAnchors = document.getElementById("snapAnchors");
  const progressReadout = document.getElementById("progressReadout");
  const scrollDot = document.getElementById("scrollDot");
  const filterBar = document.getElementById("filterBar");
  const indexToggle = document.getElementById("indexToggle");
  const catalogDrawer = document.getElementById("catalogDrawer");
  const catalogClose = document.getElementById("catalogClose");
  const catalogList = document.getElementById("catalogList");

  const quoteModal = document.getElementById("quoteModal");
  const modalClose = document.getElementById("modalClose");
  const modalTask = document.getElementById("modalTask");
  const modalStatus = document.getElementById("modalStatus");
  const modalHeaderTag = document.getElementById("modalHeaderTag");
  const modalFullQuote = document.getElementById("modalFullQuote");
  const modalNote = document.getElementById("modalNote");
  const modalStep = document.getElementById("modalStep");
  const modalLink = document.getElementById("modalLink");

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let activeFilter = "all";
  let filteredQuotes = [...ALL_QUOTES];
  let slideElements = [];
  let currentSlideIndex = 0;
  let rafId = null;

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatInlineCode(escaped) {
    return escaped.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  }

  function renderFullQuoteWithHighlight(quote, highlight) {
    const safe = escapeHtml(quote);
    const safeHl = highlight ? escapeHtml(highlight) : "";
    let html = safe;
    if (safeHl && safe.includes(safeHl)) {
      html = safe.replace(safeHl, `<span class="hl">${safeHl}</span>`);
    }
    return `&ldquo;${formatInlineCode(html)}&rdquo;`;
  }

  function sizeClassForHeadline(text) {
    if (text.length <= 54) return "size-mega";
    if (text.length <= 92) return "size-xl";
    return "size-lg";
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function openQuoteModal(q) {
    const isPass = q.reward === 1;
    modalTask.textContent = q.task;
    modalStatus.textContent = isPass ? "pass · 1.0" : "fail · 0.0";
    modalStatus.className = `modal-status ${isPass ? "pass" : "fail"}`;
    modalHeaderTag.textContent = q.header ? q.header.toLowerCase() : "";
    modalHeaderTag.style.display = q.header ? "block" : "none";
    modalFullQuote.innerHTML = renderFullQuoteWithHighlight(q.quote, q.highlight);
    modalNote.textContent = q.note || "";
    modalNote.style.display = q.note ? "block" : "none";
    modalStep.textContent = `step ${q.step} · ${q.source.toLowerCase()} · trial ${q.trialId.slice(0, 8)}`;
    modalLink.href = q.url;

    quoteModal.hidden = false;
    document.body.style.overflow = "hidden";
    modalClose.focus();
  }

  function closeQuoteModal() {
    quoteModal.hidden = true;
    if (catalogDrawer.hidden) {
      document.body.style.overflow = "";
    }
  }

  function buildCoverSlide() {
    const el = document.createElement("section");
    el.className = "slide";
    el.innerHTML = `
      <p class="slide-corner-label">gemini 4 neon · terminal-bench 4.1</p>
      <div class="cover-wrap">
        <h1 class="cover-title"><em>${META.totalExclamations.toLocaleString()}</em> exclamation marks.</h1>
        <p class="cover-sub">
          ${ALL_QUOTES.length} verbatim moments from ${META.trajectoriesScanned} trajectories—click any quote for full context.
        </p>
        <button class="scroll-cue" type="button" data-jump="1">scroll ↓</button>
      </div>
    `;
    el.querySelector("[data-jump]")?.addEventListener("click", () => jumpToSlide(1));
    return el;
  }

  function buildQuoteSlide(q) {
    const el = document.createElement("article");
    el.className = "slide";
    const headline = q.headline || q.highlight || q.quote;
    const sizeClass = sizeClassForHeadline(headline);
    const failMarkup = q.reward === 0 ? `<span class="fail-dot">· fail</span>` : "";

    el.innerHTML = `
      <p class="slide-corner-label">
        <span>${escapeHtml(q.task)}</span>
        ${failMarkup}
      </p>
      <button class="quote-trigger" type="button" aria-label="Open full quote and context for ${escapeHtml(q.task)}">
        <blockquote class="quote-headline ${sizeClass}">
          &ldquo;${formatInlineCode(escapeHtml(headline))}&rdquo;
        </blockquote>
        <span class="quote-hint">more context +</span>
      </button>
    `;

    el.querySelector(".quote-trigger").addEventListener("click", () => openQuoteModal(q));
    return el;
  }

  function buildOutroSlide() {
    const el = document.createElement("section");
    el.className = "slide";
    el.innerHTML = `
      <p class="slide-corner-label">${META.thrilledCount} thrilled · ${META.ecstaticCount} ecstatic</p>
      <div class="outro-wrap">
        <h2 class="outro-title">Built for hard problems.<br /><em>Way too excited to solve them.</em></h2>
        <div class="outro-links">
          <button type="button" data-jump="0">back to top ↑</button>
          <a href="${META.jobUrl}" target="_blank" rel="noopener noreferrer">full job on harbor hub ↗</a>
        </div>
      </div>
    `;
    el.querySelector("[data-jump]")?.addEventListener("click", () => jumpToSlide(0));
    return el;
  }

  function buildCatalogList() {
    catalogList.innerHTML = "";
    filteredQuotes.forEach((q, idx) => {
      const slideIdx = idx + 1;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "catalog-row";
      const failTag = q.reward === 0 ? `<span class="fail-dot">fail</span>` : "";
      btn.innerHTML = `
        <span class="catalog-row-num">${pad2(slideIdx)}</span>
        <span>
          <span class="catalog-row-task">${escapeHtml(q.task)}${failTag}</span>
          <span class="catalog-row-quote">${escapeHtml(q.headline || q.highlight)}</span>
        </span>
      `;
      btn.addEventListener("click", () => {
        closeCatalog();
        jumpToSlide(slideIdx);
      });
      catalogList.appendChild(btn);
    });
  }

  function rebuildDeck() {
    filteredQuotes =
      activeFilter === "all"
        ? [...ALL_QUOTES]
        : ALL_QUOTES.filter((q) => q.categories.includes(activeFilter));

    slidesViewport.innerHTML = "";
    snapAnchors.innerHTML = "";

    const totalSlides = filteredQuotes.length + 2;
    scrollTrack.style.height = `${totalSlides * 100}svh`;

    slideElements = [];

    const cover = buildCoverSlide();
    slidesViewport.appendChild(cover);
    slideElements.push(cover);

    filteredQuotes.forEach((q) => {
      const plate = buildQuoteSlide(q);
      slidesViewport.appendChild(plate);
      slideElements.push(plate);
    });

    const outro = buildOutroSlide();
    slidesViewport.appendChild(outro);
    slideElements.push(outro);

    for (let i = 0; i < totalSlides; i++) {
      const anchor = document.createElement("div");
      anchor.className = "snap-anchor";
      snapAnchors.appendChild(anchor);
    }

    buildCatalogList();
    renderFrame();
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function renderFrame() {
    const vh = window.innerHeight || 1;
    const totalSlides = slideElements.length;
    const maxProgress = Math.max(1, totalSlides - 1);
    const rawProgress = Math.max(0, Math.min(maxProgress, window.scrollY / vh));
    const nearest = Math.round(rawProgress);

    scrollDot.style.top = `${(rawProgress / maxProgress) * 100}%`;

    for (let i = 0; i < totalSlides; i++) {
      const el = slideElements[i];
      const delta = rawProgress - i;
      const dist = Math.abs(delta);

      if (dist >= 0.72) {
        if (el.classList.contains("is-visible")) {
          el.classList.remove("is-visible", "is-interactive");
          el.style.opacity = "0";
          el.style.filter = "none";
        }
        continue;
      }

      let opacity = 1;
      let shiftY = 0;
      let blurPx = 0;

      if (dist > 0.22) {
        const t = Math.min(1, (dist - 0.22) / (0.72 - 0.22));
        const eased = easeInOutCubic(t);
        opacity = 1 - eased;
        shiftY = (delta > 0 ? -18 : 18) * eased;
        blurPx = prefersReducedMotion ? 0 : 12 * eased;
      }

      el.classList.add("is-visible");
      el.classList.toggle("is-interactive", dist < 0.35);
      el.style.opacity = opacity.toFixed(4);
      el.style.transform = `translate3d(0, ${shiftY.toFixed(2)}px, 0)`;
      el.style.filter = blurPx > 0.05 ? `blur(${blurPx.toFixed(2)}px)` : "none";
    }

    if (nearest !== currentSlideIndex || !progressReadout.dataset.init) {
      currentSlideIndex = nearest;
      progressReadout.dataset.init = "1";
      if (nearest === 0 || nearest === totalSlides - 1) {
        progressReadout.textContent = "";
      } else {
        progressReadout.textContent = `${pad2(nearest)} / ${pad2(filteredQuotes.length)}`;
      }
    }

    rafId = null;
  }

  function scheduleRender() {
    if (rafId === null) {
      rafId = window.requestAnimationFrame(renderFrame);
    }
  }

  function jumpToSlide(index) {
    const clamped = Math.max(0, Math.min(slideElements.length - 1, index));
    const vh = window.innerHeight || 1;
    window.scrollTo({
      top: clamped * vh,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }

  function openCatalog() {
    catalogDrawer.hidden = false;
    indexToggle.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeCatalog() {
    catalogDrawer.hidden = true;
    indexToggle.setAttribute("aria-expanded", "false");
    if (quoteModal.hidden) {
      document.body.style.overflow = "";
    }
  }

  window.addEventListener("scroll", scheduleRender, { passive: true });
  window.addEventListener("resize", scheduleRender, { passive: true });

  modalClose.addEventListener("click", closeQuoteModal);
  quoteModal.addEventListener("click", (e) => {
    if (e.target === quoteModal) closeQuoteModal();
  });

  indexToggle.addEventListener("click", () => {
    if (catalogDrawer.hidden) openCatalog();
    else closeCatalog();
  });
  catalogClose.addEventListener("click", closeCatalog);
  catalogDrawer.addEventListener("click", (e) => {
    if (e.target === catalogDrawer) closeCatalog();
  });

  filterBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    const nextFilter = btn.dataset.filter;
    if (!nextFilter || nextFilter === activeFilter) return;

    activeFilter = nextFilter;
    filterBar.querySelectorAll(".filter-btn").forEach((b) => {
      b.classList.toggle("is-active", b === btn);
    });
    rebuildDeck();
    closeCatalog();
    window.scrollTo({ top: nextFilter === "all" ? 0 : window.innerHeight, behavior: "smooth" });
  });

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!quoteModal.hidden) {
      if (e.key === "Escape") closeQuoteModal();
      return;
    }
    if (!catalogDrawer.hidden) {
      if (e.key === "Escape") closeCatalog();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "j" || e.key === "PageDown") {
      e.preventDefault();
      jumpToSlide(currentSlideIndex + 1);
    } else if (e.key === "ArrowUp" || e.key === "k" || e.key === "PageUp") {
      e.preventDefault();
      jumpToSlide(currentSlideIndex - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      jumpToSlide(0);
    } else if (e.key === "End") {
      e.preventDefault();
      jumpToSlide(slideElements.length - 1);
    } else if (e.key === "i") {
      e.preventDefault();
      openCatalog();
    } else if (e.key === "Enter" && currentSlideIndex > 0 && currentSlideIndex <= filteredQuotes.length) {
      e.preventDefault();
      openQuoteModal(filteredQuotes[currentSlideIndex - 1]);
    }
  });

  rebuildDeck();

  const hashMatch = window.location.hash.match(/^#plate-(\d+)$/);
  if (hashMatch) {
    const idx = parseInt(hashMatch[1], 10);
    if (!Number.isNaN(idx)) {
      window.scrollTo(0, idx * window.innerHeight);
      renderFrame();
    }
  }
})();
