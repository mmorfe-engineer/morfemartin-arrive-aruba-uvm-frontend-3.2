/**
 * Arrive Aruba — Journey Organic (canvas sprite scrub)
 * Restored from commit e401595 and repaired for:
 * - frame 0 / closed window on first paint
 * - scroll → progress → frame (section-relative)
 * - landscape motion phase after ~2.5vh section scroll
 * - correct desktop vs mobile sheet selection on resize
 */
(function () {
  "use strict";

  if (window.__AAOrganicJourneyRuntime) {
    window.__AAOrganicJourneyRuntime.mountWithin(document);
    return;
  }

  var instances = new WeakMap();
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var compactQuery = window.matchMedia("(max-width: 640px)");

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function ease(value) {
    var t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function reveal(progress, start, end) {
    var fade = Math.min(0.08, (end - start) * 0.35);
    var enter = ease((progress - start) / fade);
    var leave = 1 - ease((progress - (end - fade)) / fade);
    return clamp(Math.min(enter, leave), 0, 1);
  }

  function connectionIsSlow() {
    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return false;
    return Boolean(connection.saveData || /(^|-)slow-2g|(^|-)2g|(^|-)3g/.test(connection.effectiveType || ""));
  }

  function scrollTrackPx(root, viewportHeight) {
    /* data-scroll-length is CSS vh units (100 = one viewport). Need >= ~400 so
       usable scroll can reach the 2.5*innerHeight landscape gate. */
    var length = clamp(Number(root.dataset.scrollLength) || 500, 400, 600);
    var vh = viewportHeight || window.innerHeight;
    return Math.round((length / 100) * vh);
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.decoding = "async";
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error("Unable to load " + url)); };
      image.src = url;
    });
  }

  function loadBitmap(url) {
    if (!window.createImageBitmap || !window.fetch) return loadImage(url);
    return fetch(url, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("Unable to fetch " + url + ": " + response.status);
        return response.blob();
      })
      .then(function (blob) { return createImageBitmap(blob); })
      .catch(function () { return loadImage(url); });
  }

  function OrganicJourney(root) {
    this.root = root;
    this.sticky = root.querySelector(".aa-organic-journey__sticky, .aa-figma-hero__sticky");
    this.portal = root.querySelector(".aa-figma-hero__window");
    this.visual = root.querySelector("[data-journey-visual]");
    this.canvas = root.querySelector("[data-journey-canvas]");
    this.poster = root.querySelector("[data-journey-poster]");
    this.finalImage = root.querySelector("[data-journey-final]");
    this.copy = root.querySelector("[data-journey-copy]");
    this.status = root.querySelector("[data-journey-status]");
    this.clouds = Array.prototype.slice.call(root.querySelectorAll(".aa-organic-cloud"));
    this.lockScale = root.hasAttribute("data-journey-lock-scale");
    this.context = this.canvas ? this.canvas.getContext("2d", {
      alpha: true,
      /* desynchronized can tear/jitter on mobile GPUs during scrub */
      desynchronized: !this.lockScale
    }) : null;

    this.config = null;
    this.variant = null;
    this.variantKey = "";
    this.manifestUrl = null;
    this.loadedSheets = new Map();
    this.pendingSheets = new Map();
    this.pendingFrame = 0;
    this.currentSheetIndex = -1;
    this.currentScale = 1;
    this.targetScale = 1;
    this.active = false;
    this.destroyed = false;
    this.raf = 0;
    this.staticMode = reduceMotion.matches || connectionIsSlow();
    /* Homepage: freeze vh so mobile URL-bar show/hide cannot retarget progress/frames. */
    this.stableVh = window.innerHeight;
    this.lastInnerW = window.innerWidth;
    this.lastInnerH = window.innerHeight;
    this.lastDrawnFrame = -1;
    this.lastDrawnSheet = -1;
    this.lastScaleCss = "";

    this.tick = this.tick.bind(this);
    this.onVisibility = this.onVisibility.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onBreakpoint = this.onBreakpoint.bind(this);
    this.onScroll = this.onScroll.bind(this);
    this.onOrientation = this.onOrientation.bind(this);

    root.style.height = scrollTrackPx(root, this.stableVh) + "px";

    /* Closed poster first — never final/open still as the first paint. */
    if (root.dataset.fallbackPoster && this.poster) {
      this.poster.src = root.dataset.fallbackPoster;
    }
    this.applyVisualScale(1);
    if (this.visual) {
      this.visual.style.setProperty("--aa-final-opacity", "0");
    }
    this.applyPortalWhite(0);
    this.root.style.setProperty("--aa-progress", "0");

    this.visibilityObserver = new IntersectionObserver(this.onVisibility, { rootMargin: "100% 0px" });
    this.visibilityObserver.observe(root);
    /*
      Homepage: do NOT observe sticky via ResizeObserver — mobile URL-bar
      collapse retargets height/progress and causes frame jitter.
      Lab keeps ResizeObserver for its full-bleed layout.
    */
    if (this.lockScale) {
      window.addEventListener("resize", this.onResize, { passive: true });
    } else {
      this.resizeObserver = new ResizeObserver(this.onResize);
      this.resizeObserver.observe(this.sticky || root);
    }
    window.addEventListener("scroll", this.onScroll, { passive: true });
    window.addEventListener("orientationchange", this.onOrientation);

    if (compactQuery.addEventListener) {
      compactQuery.addEventListener("change", this.onBreakpoint);
    } else if (compactQuery.addListener) {
      compactQuery.addListener(this.onBreakpoint);
    }

    this.loadConfig();
  }

  OrganicJourney.prototype.inlineConfig = function () {
    var node = this.root.querySelector("[data-journey-organic-config]");
    if (!node) return null;
    try {
      return JSON.parse(node.textContent);
    } catch (error) {
      throw new Error("Invalid inline Journey Organic config: " + error.message);
    }
  };

  OrganicJourney.prototype.loadConfig = function () {
    var self = this;
    var inline = this.inlineConfig();
    if (inline) {
      this.manifestUrl = document.baseURI;
      this.applyConfig(inline);
      return;
    }

    if (!this.root.dataset.manifest) {
      this.fallback("Journey assets are not configured");
      return;
    }

    this.manifestUrl = new URL(this.root.dataset.manifest, document.baseURI).href;
    fetch(this.manifestUrl, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("Manifest request failed: " + response.status);
        return response.json();
      })
      .then(function (config) { self.applyConfig(config); })
      .catch(function (error) { self.fallback(error.message); });
  };

  OrganicJourney.prototype.assetUrl = function (source) {
    if (!source) return "";
    var url = new URL(source, this.manifestUrl || document.baseURI);
    if (this.manifestUrl) {
      var version = new URL(this.manifestUrl, document.baseURI).searchParams.get("v");
      if (version && !url.searchParams.has("v")) url.searchParams.set("v", version);
    }
    return url.href;
  };

  OrganicJourney.prototype.pickVariantKey = function () {
    var compact = compactQuery.matches;
    if (compact && this.config.variants.mobile) return "mobile";
    return "desktop";
  };

  OrganicJourney.prototype.applyConfig = function (config) {
    if (!config || Number(config.version) !== 3 || !config.variants) {
      this.fallback("Journey manifest v3 is required");
      return;
    }

    this.config = config;
    this.bindVariant(this.pickVariantKey(), true);
  };

  OrganicJourney.prototype.clearSheets = function () {
    this.loadedSheets.forEach(function (bitmap) {
      if (bitmap && bitmap.close) bitmap.close();
    });
    this.loadedSheets.clear();
    this.pendingSheets.clear();
    this.currentSheetIndex = -1;
  };

  OrganicJourney.prototype.bindVariant = function (key, isInitial) {
    var variant = this.config.variants[key];
    if (!variant || !variant.clip || !variant.clip.sheets || !variant.clip.sheets.length) {
      this.fallback("Journey sprite sheets are missing");
      return;
    }

    if (!isInitial && key === this.variantKey && this.variant) {
      this.renderProgress(this.progress());
      return;
    }

    this.clearSheets();
    this.variantKey = key;
    this.variant = variant;

    var cell = this.variant.cell;
    this.canvas.width = cell.width;
    this.canvas.height = cell.height;
    this.visual.style.setProperty("--aa-visual-ratio", (cell.width / cell.height).toFixed(5));

    /* Poster = closed start. Never seed the open staticStill as first paint. */
    var posterSrc = this.assetUrl(this.variant.poster && this.variant.poster.src);
    this.poster.src = posterSrc || this.root.dataset.fallbackPoster || "";
    this.finalImage.src = this.assetUrl(this.variant.finalStill && this.variant.finalStill.src);
    this.finalImage.hidden = false;
    this.finalImage.removeAttribute("hidden");

    var aperture = this.config.aperture || { x: 0.12, y: 0.12, width: 0.76, height: 0.76 };
    this.visual.style.setProperty("--aa-origin-x", ((aperture.x + aperture.width / 2) * 100).toFixed(3) + "%");
    this.visual.style.setProperty("--aa-origin-y", ((aperture.y + aperture.height / 2) * 100).toFixed(3) + "%");
    this.applyVisualScale(1);
    this.visual.style.setProperty("--aa-final-opacity", "0");
    this.currentScale = 1;
    this.targetScale = 1;
    this.pendingFrame = 0;
    this.lastDrawnFrame = -1;
    this.lastDrawnSheet = -1;

    if (this.staticMode) {
      this.root.style.height = "100dvh";
      this.root.dataset.state = "static";
      if (this.status) this.status.textContent = "A still view is shown for this device";
      this.renderStatic();
      return;
    }

    this.root.style.height = scrollTrackPx(this.root, this.stableVh) + "px";

    /* Explicit first paint path: frame 0 only. */
    this.requestFrame(0);
    this.loadSheet(0);
    loadImage(this.finalImage.src).catch(function () {});
    this.renderProgress(this.progress());
  };

  OrganicJourney.prototype.applyVisualScale = function (scale) {
    var value = clamp(Number(scale) || 1, 1, this.lockScale ? 24 : 8);
    /* Quantize to limit subpixel transform chatter on mobile DPR displays. */
    value = Math.round(value * 1000) / 1000;
    var css = value.toFixed(3);
    this.currentScale = value;

    if (this.lockScale) {
      /*
        Phase 1 portal camera: scale the WINDOW SLOT (.aa-figma-hero__window),
        not the inner visual. Inner visual stays at 1 so Journey frames
        (arco + tapa + landscape) grow as one physical portal.
      */
      if (this.visual) {
        this.visual.style.setProperty("--aa-visual-scale", "1", "important");
        this.visual.style.setProperty("transform", "none", "important");
      }
      if (!this.portal) return;
      if (css === this.lastScaleCss) return;
      this.lastScaleCss = css;
      var aperture = (this.config && this.config.aperture) || { x: 0.12, y: 0.12, width: 0.76, height: 0.76 };
      var originX = ((aperture.x + aperture.width / 2) * 100).toFixed(3) + "%";
      var originY = ((aperture.y + aperture.height / 2) * 100).toFixed(3) + "%";
      this.portal.style.setProperty("transform", "scale(" + css + ")", "important");
      this.portal.style.setProperty("transform-origin", originX + " " + originY, "important");
      this.portal.style.setProperty("--aa-portal-scale", css);
      this.root.setAttribute("data-portal-scale", css);
      return;
    }

    if (!this.visual) return;
    if (css === this.lastScaleCss) return;
    this.lastScaleCss = css;
    this.visual.style.setProperty("--aa-visual-scale", css);
  };

  OrganicJourney.prototype.portalFillScale = function () {
    /* Aperture geometry → viewport fill (storyboard Estados 3–4). */
    if (!this.portal) return 1;
    var layoutW = this.portal.offsetWidth || 1;
    var layoutH = this.portal.offsetHeight || 1;
    var aperture = (this.config && this.config.aperture) || { width: 0.76, height: 0.76 };
    var apertureW = Math.max(1, layoutW * aperture.width);
    var apertureH = Math.max(1, layoutH * aperture.height);
    var viewW = window.innerWidth;
    var viewH = this.stableVh || window.innerHeight;
    var fill = Math.max(viewW / apertureW, viewH / apertureH) * 1.03;
    /* Floor only — no small fixed caps that leave a centered “card”. */
    return Math.max(1.35, fill);
  };

  OrganicJourney.prototype.cameraMaxScale = function () {
    return this.lockScale ? this.portalFillScale() : 8;
  };

  OrganicJourney.prototype.shadeScrollGate = function (metrics) {
    var landscapeScroll = metrics.viewportHeight * 2.5;
    if (landscapeScroll > metrics.usableScroll * 0.6) {
      landscapeScroll = metrics.usableScroll * 0.45;
    }
    return Math.max(metrics.viewportHeight * 0.75, landscapeScroll);
  };

  OrganicJourney.prototype.portalEnterProgress = function (metrics) {
    var gate = this.shadeScrollGate(metrics);
    if (metrics.sectionScroll <= gate) return 0;
    return clamp(
      (metrics.sectionScroll - gate) / Math.max(1, metrics.usableScroll - gate),
      0,
      1
    );
  };

  OrganicJourney.prototype.portalScaleForScroll = function (metrics) {
    var fill = this.portalFillScale();
    /*
      Storyboard scale curve (single camera push):
      Estado 1–2 (pre-gate): perceptible push-in while window stays in clouds.
      Estado 3–4 (post-gate): grow to real aperture fill so frame exits edges.
    */
    var approachEnd = Math.min(1.55, 1 + (fill - 1) * 0.1);
    var gate = this.shadeScrollGate(metrics);
    if (metrics.sectionScroll <= 0) return 1;
    if (metrics.sectionScroll < gate) {
      var t = ease(metrics.sectionScroll / gate);
      return 1 + (approachEnd - 1) * t;
    }
    var enterT = this.portalEnterProgress(metrics);
    /* Reach full aperture fill by ~enterT 0.4 (Estado 4), then hold before white. */
    var enterEase = ease(clamp(enterT / 0.4, 0, 1));
    return approachEnd + (fill - approachEnd) * enterEase;
  };

  /**
   * Full-viewport whiteout (homepage).
   * Storyboard Estado 5: progressive white AFTER landscape dominates (Estado 4).
   * Full opacity at enter end — no flash, no independent crossfade.
   */
  OrganicJourney.prototype.portalWhiteForScroll = function (metrics, frame) {
    if (!this.lockScale || !this.variant) return 0;
    if (metrics.sectionScroll <= 0) return 0;

    var maxFrame = this.variant.clip.frameCount - 1;
    var whiteStartFrame = Number(this.config.frames && this.config.frames.whiteoutStart);
    if (!Number.isFinite(whiteStartFrame) || whiteStartFrame <= 0) {
      whiteStartFrame = Math.round(maxFrame * 0.58);
    }

    var enterProgress = this.portalEnterProgress(metrics);

    /* White starts after Estado 4 (~enterT 0.55); completes at enter end. */
    var whiteFromScroll = ease(clamp((enterProgress - 0.55) / 0.45, 0, 1));
    var whiteFromFrame = ease(
      clamp((frame - whiteStartFrame) / Math.max(1, maxFrame - whiteStartFrame), 0, 1)
    );
    /* Prefer scroll timing so white never starts before landscape fill. */
    var white = whiteFromScroll;
    if (enterProgress >= 0.55) {
      white = Math.max(whiteFromScroll, whiteFromFrame * whiteFromScroll);
    }
    return Math.round(white * 1000) / 1000;
  };

  OrganicJourney.prototype.portalChromeForScroll = function (metrics, white) {
    if (!this.lockScale) return 1;
    if (metrics.sectionScroll <= 0) return 1;
    var enterT = this.portalEnterProgress(metrics);
    if (enterT <= 0) return 1;
    var chrome;
    if (enterT < 0.35) {
      /* Estado 3: 1 → 0.85 */
      chrome = 1 - 0.15 * ease(enterT / 0.35);
    } else if (enterT < 0.55) {
      /* Estado 4: 0.85 → ~0.375 */
      chrome = 0.85 + (0.375 - 0.85) * ease((enterT - 0.35) / 0.2);
    } else {
      /* Estado 5: fade to 0 with progressive white */
      chrome = 0.375 * (1 - clamp(white, 0, 1));
    }
    return Math.round(chrome * 1000) / 1000;
  };

  OrganicJourney.prototype.applyPortalWhite = function (white) {
    var css = clamp(Number(white) || 0, 0, 1).toFixed(3);
    if (this.sticky) this.sticky.style.setProperty("--aa-portal-white", css);
    this.root.style.setProperty("--aa-portal-white", css);
    this.root.setAttribute("data-portal-white", css);
  };

  OrganicJourney.prototype.applyPortalChrome = function (chrome) {
    var css = clamp(Number(chrome) || 0, 0, 1).toFixed(3);
    this.root.style.setProperty("--aa-chrome-opacity", css);
    this.root.setAttribute("data-chrome-opacity", css);
  };

  OrganicJourney.prototype.renderProgress = function (progress) {
    if (!this.variant || this.staticMode) return;
    var metrics = this.scrollMetrics();
    progress = metrics.progress;

    var timeline = this.config.timeline;
    var frame = this.frameForScroll(metrics);
    this.requestFrame(frame);

    var zoomProgress = ease((progress - timeline.zoomStart) / (timeline.zoomEnd - timeline.zoomStart));
    var finalOpacity = ease((progress - timeline.finalSwap) / 0.08);
    var portalWhite = 0;

    /* At true start, lock scale/final so there is no open/white flash. */
    if (progress <= 0.0001 || metrics.sectionScroll <= 0) {
      zoomProgress = 0;
      finalOpacity = 0;
      portalWhite = 0;
      frame = 0;
      this.requestFrame(0);
    }

    var portalChrome = 1;
    if (this.lockScale) {
      this.currentScale = this.portalScaleForScroll(metrics);
      this.targetScale = this.portalFillScale();
      if (progress <= 0.0001 || metrics.sectionScroll <= 0) this.currentScale = 1;
      portalWhite = this.portalWhiteForScroll(metrics, Math.round(frame));
      portalChrome = this.portalChromeForScroll(metrics, portalWhite);
      if (progress <= 0.0001 || metrics.sectionScroll <= 0) {
        portalWhite = 0;
        portalChrome = 1;
      }
      /* Slot final.webp stays under the full-bleed veil; keep it muted. */
      finalOpacity = Math.min(finalOpacity, portalWhite * 0.35);
    } else {
      this.targetScale = this.calculateTargetScale();
      this.currentScale = 1 + (this.targetScale - 1) * zoomProgress;
    }

    this.applyVisualScale(this.currentScale);
    this.applyPortalWhite(portalWhite);
    this.applyPortalChrome(portalChrome);
    this.visual.style.setProperty("--aa-final-opacity", finalOpacity.toFixed(4));
    this.root.style.setProperty("--aa-progress", progress.toFixed(5));
    /* Homepage chrome fade is --aa-chrome-opacity; keep lab copy reveal for non-lock. */
    this.root.style.setProperty(
      "--aa-copy-opacity",
      this.lockScale ? "1" : reveal(progress, 0.23, 0.52).toFixed(4)
    );

    var offsets = [10, -16, 24];
    var vertical = [-2, 3, -4];
    this.clouds.forEach(function (cloud, index) {
      cloud.style.setProperty("--cloud-x", (offsets[index] * progress).toFixed(2) + "vw");
      cloud.style.setProperty("--cloud-y", (vertical[index] * progress).toFixed(2) + "vh");
    });
  };

  OrganicJourney.prototype.sheetForFrame = function (frameIndex) {
    var sheets = this.variant.clip.sheets;
    for (var index = 0; index < sheets.length; index += 1) {
      var sheet = sheets[index];
      if (frameIndex >= sheet.frameOffset && frameIndex < sheet.frameOffset + sheet.frameCount) {
        return { index: index, sheet: sheet };
      }
    }
    return { index: sheets.length - 1, sheet: sheets[sheets.length - 1] };
  };

  OrganicJourney.prototype.loadSheet = function (index) {
    var self = this;
    var sheet = this.variant.clip.sheets[index];
    if (!sheet || this.loadedSheets.has(index)) return Promise.resolve(this.loadedSheets.get(index));
    if (this.pendingSheets.has(index)) return this.pendingSheets.get(index);

    var promise = loadBitmap(this.assetUrl(sheet.src))
      .then(function (bitmap) {
        self.pendingSheets.delete(index);
        if (self.destroyed) {
          if (bitmap && bitmap.close) bitmap.close();
          return null;
        }
        self.loadedSheets.set(index, bitmap);
        self.trimMemory(self.currentSheetIndex >= 0 ? self.currentSheetIndex : index);
        if (index === self.currentSheetIndex || (self.pendingFrame >= sheet.frameOffset && self.pendingFrame < sheet.frameOffset + sheet.frameCount)) {
          self.drawFrame(self.pendingFrame);
        }
        self.root.dataset.state = "ready";
        return bitmap;
      })
      .catch(function (error) {
        self.pendingSheets.delete(index);
        if (!self.loadedSheets.size) self.fallback(error.message);
        return null;
      });

    this.pendingSheets.set(index, promise);
    return promise;
  };

  OrganicJourney.prototype.trimMemory = function (center) {
    var self = this;
    var windowSize = clamp(Number(this.variant.slidingWindow) || 3, 1, 3);
    var keep = new Set([center]);
    for (var distance = 1; keep.size < windowSize; distance += 1) {
      if (center + distance < this.variant.clip.sheets.length) keep.add(center + distance);
      if (keep.size < windowSize && center - distance >= 0) keep.add(center - distance);
      if (center + distance >= this.variant.clip.sheets.length && center - distance < 0) break;
    }

    this.loadedSheets.forEach(function (bitmap, index) {
      if (keep.has(index)) return;
      if (bitmap && bitmap.close) bitmap.close();
      self.loadedSheets.delete(index);
    });
  };

  OrganicJourney.prototype.prefetchNeighbors = function (center) {
    var total = this.variant.clip.sheets.length;
    if (center + 1 < total) this.loadSheet(center + 1);
    if (center - 1 >= 0) this.loadSheet(center - 1);
  };

  OrganicJourney.prototype.requestFrame = function (frameIndex) {
    var max = this.variant.clip.frameCount - 1;
    var frame = clamp(Math.round(frameIndex), 0, max);
    var target = this.sheetForFrame(frame);
    this.pendingFrame = frame;
    this.currentSheetIndex = target.index;
    if (this.loadedSheets.has(target.index)) {
      this.drawFrame(frame);
      this.prefetchNeighbors(target.index);
    } else {
      this.loadSheet(target.index);
    }
  };

  OrganicJourney.prototype.drawFrame = function (frameIndex) {
    var target = this.sheetForFrame(frameIndex);
    var bitmap = this.loadedSheets.get(target.index);
    if (!bitmap || !this.context) return;
    if (frameIndex === this.lastDrawnFrame && target.index === this.lastDrawnSheet) return;
    var sheet = target.sheet;
    var local = frameIndex - sheet.frameOffset;
    var sourceX = (local % sheet.columns) * this.variant.cell.width;
    var sourceY = Math.floor(local / sheet.columns) * this.variant.cell.height;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      this.variant.cell.width,
      this.variant.cell.height,
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );
    this.lastDrawnFrame = frameIndex;
    this.lastDrawnSheet = target.index;
  };

  /**
   * Scroll → progress (section-relative, not raw window.scrollY).
   */
  OrganicJourney.prototype.scrollMetrics = function () {
    var rect = this.root.getBoundingClientRect();
    var viewportHeight = this.lockScale ? this.stableVh : window.innerHeight;
    var usableScroll = Math.max(1, rect.height - viewportHeight);
    /* Integer scroll px — fractional getBoundingClientRect causes frame flicker on mobile. */
    var sectionScroll = Math.max(0, Math.round(-rect.top));
    var progress = clamp(sectionScroll / usableScroll, 0, 1);
    return {
      sectionScroll: sectionScroll,
      usableScroll: usableScroll,
      progress: progress,
      viewportHeight: viewportHeight
    };
  };

  OrganicJourney.prototype.progress = function () {
    return this.scrollMetrics().progress;
  };

  /**
   * Scroll → frame index.
   * Frames 0..landscapeFrame cover the closed→open shade (landscape still in-sequence).
   * After ~2.5vh of section scroll, remaining frames play landscape motion / whiteout.
   */
  OrganicJourney.prototype.frameForScroll = function (metrics) {
    var maxFrame = this.variant.clip.frameCount - 1;
    var landscapeFrame = Number(this.config.frames && this.config.frames.shadeOpen);
    if (!Number.isFinite(landscapeFrame) || landscapeFrame <= 0) {
      landscapeFrame = Math.round(maxFrame * 0.5);
    }
    landscapeFrame = clamp(landscapeFrame, 1, maxFrame - 1);

    var landscapeScroll = metrics.viewportHeight * 2.5;
    /* Keep headroom so the second phase always has scroll room. */
    if (landscapeScroll > metrics.usableScroll * 0.6) {
      landscapeScroll = metrics.usableScroll * 0.45;
    }
    landscapeScroll = Math.max(metrics.viewportHeight * 0.75, landscapeScroll);

    if (metrics.sectionScroll <= 0) return 0;

    if (metrics.sectionScroll < landscapeScroll) {
      var t = ease(metrics.sectionScroll / landscapeScroll);
      return t * landscapeFrame;
    }

    var remain = Math.max(1, metrics.usableScroll - landscapeScroll);
    var t2 = ease((metrics.sectionScroll - landscapeScroll) / remain);
    return landscapeFrame + t2 * (maxFrame - landscapeFrame);
  };

  OrganicJourney.prototype.calculateTargetScale = function () {
    if (!this.config || !this.visual) return 1;
    var aperture = this.config.aperture;
    var rect = this.visual.getBoundingClientRect();
    var baseWidth = rect.width / Math.max(0.001, this.currentScale);
    var baseHeight = rect.height / Math.max(0.001, this.currentScale);
    var apertureWidth = baseWidth * aperture.width;
    var apertureHeight = baseHeight * aperture.height;
    return Math.max(window.innerWidth / apertureWidth, window.innerHeight / apertureHeight) * 1.2;
  };

  OrganicJourney.prototype.renderStatic = function () {
    if (!this.variant) return;
    /* Closed start still — never open staticStill / final as reduced-motion default. */
    var still = this.variant.poster || this.variant.staticStill || this.variant.finalStill;
    this.poster.src = this.assetUrl(still && still.src);
    this.visual.style.setProperty("--aa-final-opacity", "0");
    this.applyVisualScale(1);
    this.applyPortalWhite(0);
    this.applyPortalChrome(1);
    this.root.style.setProperty("--aa-copy-opacity", "1");
  };

  OrganicJourney.prototype.tick = function () {
    this.raf = 0;
    if (this.destroyed || this.staticMode || !this.variant) return;
    this.renderProgress(this.progress());
    /* One-shot RAF only — no perpetual loop (mobile jitter source). */
  };

  OrganicJourney.prototype.onScroll = function () {
    if (this.destroyed || this.staticMode || !this.variant) return;
    this.active = true;
    /* Coalesce all scroll events into a single pending rAF paint. */
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  };

  OrganicJourney.prototype.onVisibility = function (entries) {
    this.active = entries.some(function (entry) { return entry.isIntersecting; });
    if (this.active && !this.raf && !this.staticMode && this.variant) {
      this.raf = requestAnimationFrame(this.tick);
    }
    if (!this.active && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    if (!this.active && !this.staticMode && this.variant) {
      /* One last paint so reverse-to-top cannot leave a late frame stuck. */
      this.renderProgress(this.progress());
    }
  };

  OrganicJourney.prototype.onBreakpoint = function () {
    if (!this.config || this.staticMode) return;
    this.bindVariant(this.pickVariantKey(), false);
  };

  OrganicJourney.prototype.onOrientation = function () {
    this.stableVh = window.innerHeight;
    this.lastInnerW = window.innerWidth;
    this.lastInnerH = window.innerHeight;
    this.onResize(true);
  };

  OrganicJourney.prototype.onResize = function (force) {
    if (!this.config) return;
    var width = window.innerWidth;
    var height = window.innerHeight;
    var widthDelta = Math.abs(width - this.lastInnerW);
    var heightDelta = Math.abs(height - this.lastInnerH);
    /* Mobile URL-bar: ignore height-only chatter entirely on homepage. */
    var heightThreshold = this.lockScale ? 120 : (compactQuery.matches ? 72 : 48);
    var meaningful = force === true || widthDelta >= 1 || (!this.lockScale && heightDelta >= heightThreshold);

    if (!meaningful) return;

    this.lastInnerW = width;
    this.lastInnerH = height;
    if (force === true || widthDelta >= 1) {
      this.stableVh = height;
    }

    this.targetScale = 1;
    this.lastScaleCss = "";
    this.lastDrawnFrame = -1;
    this.lastDrawnSheet = -1;
    if (!this.staticMode) {
      this.root.style.height = scrollTrackPx(this.root, this.stableVh) + "px";
      this.bindVariant(this.pickVariantKey(), false);
    } else {
      this.renderStatic();
    }
  };

  OrganicJourney.prototype.fallback = function (message) {
    this.staticMode = true;
    this.root.dataset.state = "fallback";
    this.root.style.height = "100dvh";
    if (this.status) this.status.textContent = message || "A still view is available";
    if (this.root.dataset.fallbackPoster) this.poster.src = this.root.dataset.fallbackPoster;
    if (this.visual) {
      this.visual.style.setProperty("--aa-final-opacity", "0");
      this.applyVisualScale(1);
    }
    this.applyPortalWhite(0);
    this.applyPortalChrome(1);
    this.root.style.setProperty("--aa-copy-opacity", "1");
  };

  OrganicJourney.prototype.destroy = function () {
    var self = this;
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.visibilityObserver.disconnect();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    window.removeEventListener("scroll", this.onScroll);
    window.removeEventListener("orientationchange", this.onOrientation);
    window.removeEventListener("resize", this.onResize);
    if (compactQuery.removeEventListener) {
      compactQuery.removeEventListener("change", this.onBreakpoint);
    } else if (compactQuery.removeListener) {
      compactQuery.removeListener(this.onBreakpoint);
    }
    this.loadedSheets.forEach(function (bitmap) {
      if (bitmap && bitmap.close) bitmap.close();
    });
    this.loadedSheets.clear();
    this.pendingSheets.clear();
    instances.delete(self.root);
  };

  function mount(root) {
    if (!root || instances.has(root)) return;
    instances.set(root, new OrganicJourney(root));
  }

  function mountWithin(scope) {
    if (scope && scope.matches && scope.matches("[data-journey-organic]")) mount(scope);
    (scope || document).querySelectorAll("[data-journey-organic]").forEach(mount);
  }

  function destroyWithin(scope) {
    if (!scope) return;
    var roots = [];
    if (scope.matches && scope.matches("[data-journey-organic]")) roots.push(scope);
    scope.querySelectorAll("[data-journey-organic]").forEach(function (root) { roots.push(root); });
    roots.forEach(function (root) {
      var instance = instances.get(root);
      if (instance) instance.destroy();
    });
  }

  window.__AAOrganicJourneyRuntime = {
    mountWithin: mountWithin,
    destroyWithin: destroyWithin
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { mountWithin(document); }, { once: true });
  } else {
    mountWithin(document);
  }

  document.addEventListener("shopify:section:load", function (event) { mountWithin(event.target); });
  document.addEventListener("shopify:section:unload", function (event) { destroyWithin(event.target); });
})();
