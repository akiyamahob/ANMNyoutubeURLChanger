(() => {
  const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
  const VIDEO_ID_SEARCH = /(?:youtu\.be\/|\/shorts\/|\/embed\/|\/live\/|[?&]v=)([A-Za-z0-9_-]{11})/;
  const OEMBED_ENDPOINT = "https://www.youtube.com/oembed?format=json&url=";

  function normalizeInput(rawInput) {
    return String(rawInput || "").trim();
  }

  function withProtocol(input) {
    if (/^[a-z][a-z\d+\-.]*:\/\//i.test(input)) {
      return input;
    }

    if (/^(?:www\.|m\.|music\.)?youtube\.com\//i.test(input) || /^youtu\.be\//i.test(input)) {
      return `https://${input}`;
    }

    return input;
  }

  function findVideoIdFromUrl(url) {
    const hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    const pathname = url.pathname;

    if (hostname === "youtu.be") {
      const id = pathname.split("/").filter(Boolean)[0];
      return VIDEO_ID_PATTERN.test(id) ? id : null;
    }

    if (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com" ||
      hostname === "youtube-nocookie.com"
    ) {
      const fromQuery = url.searchParams.get("v");
      if (VIDEO_ID_PATTERN.test(fromQuery)) {
        return fromQuery;
      }

      const parts = pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0]) && VIDEO_ID_PATTERN.test(parts[1])) {
        return parts[1];
      }
    }

    return null;
  }

  function findVideoId(input) {
    const normalized = normalizeInput(input);
    if (!normalized) {
      return null;
    }

    if (VIDEO_ID_PATTERN.test(normalized)) {
      return normalized;
    }

    try {
      const url = new URL(withProtocol(normalized));
      const id = findVideoIdFromUrl(url);
      if (id) {
        return id;
      }
    } catch (_) {
      // Fall through to text matching for pasted snippets.
    }

    const match = normalized.match(VIDEO_ID_SEARCH);
    return match ? match[1] : null;
  }

  function toShortUrl(input) {
    const id = findVideoId(input);

    if (!id) {
      throw new Error("YouTube video ID could not be found.");
    }

    return `https://youtu.be/${id}`;
  }

  function convertMany(input) {
    return normalizeInput(input)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => toShortUrl(line));
  }

  function firstVideoId(input) {
    const lines = normalizeInput(input)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const id = findVideoId(line);
      if (id) {
        return id;
      }
    }

    return null;
  }

  function thumbnailUrl(videoId) {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }

  function watchUrl(videoId) {
    return `https://youtu.be/${videoId}`;
  }

  function bindConverter(root = document) {
    const source = root.querySelector("#source-url");
    const pasteButton = root.querySelector("#paste-button");
    const convertButton = root.querySelector("#convert-button");
    const result = root.querySelector("#result-url");
    const copyButton = root.querySelector("#copy-button");
    const error = root.querySelector("#error");
    const previewCard = root.querySelector("#preview-card");
    const previewLink = root.querySelector("#preview-link");
    const previewImage = root.querySelector("#preview-image");
    const previewTitle = root.querySelector("#preview-title-text");
    const previewUrl = root.querySelector("#preview-url-text");
    let convertTimer = 0;
    let previewRequestId = 0;

    if (!source || !result) {
      return;
    }

    const clearError = () => {
      if (error) {
        error.textContent = "";
      }
    };

    const showError = (message) => {
      if (error) {
        error.textContent = message;
      }
    };

    const clearPreview = () => {
      previewRequestId += 1;

      if (previewCard) {
        previewCard.classList.add("is-empty");
      }

      if (previewLink) {
        previewLink.href = "";
      }

      if (previewImage) {
        previewImage.src = "";
        previewImage.alt = "";
      }

      if (previewTitle) {
        previewTitle.textContent = "動画サムネとタイトルをここに表示します";
      }

      if (previewUrl) {
        previewUrl.textContent = "";
      }
    };

    const updatePreview = async (videoId) => {
      if (!previewCard || !previewLink || !previewImage || !previewTitle || !previewUrl) {
        return;
      }

      if (!videoId) {
        clearPreview();
        return;
      }

      const requestId = ++previewRequestId;
      const url = watchUrl(videoId);

      previewCard.classList.remove("is-empty");
      previewLink.href = url;
      previewImage.src = thumbnailUrl(videoId);
      previewImage.alt = "YouTube video thumbnail";
      previewTitle.textContent = "動画情報を読み込み中...";
      previewUrl.textContent = url;

      try {
        const response = await fetch(`${OEMBED_ENDPOINT}${encodeURIComponent(url)}`);
        if (!response.ok) {
          throw new Error("Preview metadata request failed.");
        }

        const data = await response.json();
        if (requestId !== previewRequestId) {
          return;
        }

        previewTitle.textContent = data.title || "YouTube video";
        previewImage.alt = data.title || "YouTube video thumbnail";
      } catch (_) {
        if (requestId !== previewRequestId) {
          return;
        }

        previewTitle.textContent = `https://youtu.be/${videoId}`;
      }
    };

    const convert = () => {
      clearError();

      const rawValue = source.value.trim();
      const previewId = firstVideoId(rawValue);
      void updatePreview(previewId);

      if (!rawValue || rawValue.length < 11) {
        result.value = "";
        return;
      }

      try {
        const urls = convertMany(rawValue);
        result.value = urls.join("\n");
      } catch (conversionError) {
        result.value = "";
        showError(conversionError.message);
      }
    };

    source.addEventListener("input", () => {
      window.clearTimeout(convertTimer);
      convertTimer = window.setTimeout(convert, 120);
    });

    if (convertButton) {
      convertButton.addEventListener("click", convert);
    }

    if (pasteButton) {
      pasteButton.addEventListener("click", async () => {
        clearError();

        try {
          source.value = await navigator.clipboard.readText();
          source.focus();
          convert();
        } catch (_) {
          showError("Paste failed. Paste into the input field manually.");
        }
      });
    }

    if (copyButton) {
      copyButton.addEventListener("click", async () => {
        clearError();

        if (!result.value) {
          return;
        }

        try {
          await navigator.clipboard.writeText(result.value);
        } catch (_) {
          showError("Copy failed. Select the result and copy it manually.");
        }
      });
    }

    clearPreview();
  }

  window.YouTubeUrlFixer = {
    bindConverter,
    convertMany,
    findVideoId,
    toShortUrl,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => bindConverter());
  } else {
    bindConverter();
  }
})();
