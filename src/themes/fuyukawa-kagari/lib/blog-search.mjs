// One active mount per document; repeated mounting preserves the current search.
const mounts = new WeakMap();
const importPagefindRuntime = () => {
  // Pagefind is generated after the Astro bundle, so load it at browser runtime.
  const path = "/pagefind/pagefind.js";
  return import(/* @vite-ignore */ path);
};

/** Mount the blog search controls. The caller owns page lifecycle wiring. */
export function mountBlogSearch({
  document = globalThis.document,
  window = globalThis.window,
  loadPagefind: importPagefind = importPagefindRuntime
} = {}) {
  const searchInput = document.querySelector("[data-blog-search]");
  const previous = mounts.get(document);
  if (searchInput && previous?.input === searchInput) return previous.cleanup;
  previous?.cleanup();
  if (!searchInput) return () => {};

  let disposed = false;
  const isCurrent = (version) => !disposed && version === searchVersion && searchInput.isConnected;
  const searchResults = document.querySelector("[data-blog-search-results]");
  const searchMeta = document.querySelector("[data-blog-search-meta]");
  const searchSummary = document.querySelector("[data-blog-search-summary]");
  const loadMoreButton = document.querySelector("[data-blog-search-more]");
  const loadMoreError = document.querySelector("[data-blog-search-error]");
  let pagefindReady;
  let currentMatches = [];
  let displayedCount = 0;
  let loadingMore = false;
  const pageSize = 5;

  const escapeHtml = (value) =>
    value.replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char] ?? char);

  const loadPagefind = async () => {
    if (!pagefindReady) {
      const pending = Promise.resolve().then(importPagefind).then(async (pagefind) => {
        await pagefind.options({
          excerptLength: 18
        });
        return pagefind;
      });
      pagefindReady = pending;
    }
    const pending = pagefindReady;
    try {
      return await pending;
    } catch (error) {
      if (pagefindReady === pending) pagefindReady = undefined;
      throw error;
    }
  };

  const renderSearchState = (message) => {
    if (!searchResults) return;
    searchResults.innerHTML = `<p class="blog-search-empty">${message}</p>`;
  };

  const updateQueryInUrl = (query) => {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  };

  const fallbackLocalSearch = (query) => {
    const cards = [...document.querySelectorAll(".blog-post-row")];
    const lowerQuery = query.toLowerCase();
    return cards
      .map((card) => ({
        url: card.querySelector(".blog-post-title-link")?.getAttribute("href")
          ?? card.querySelector(".post-cover-frame")?.getAttribute("href")
          ?? "#",
        title: card.querySelector("h2")?.textContent?.trim() ?? "Untitled",
        excerpt: card.querySelector("p")?.textContent?.trim() ?? "",
        text: card.textContent?.toLowerCase() ?? ""
      }))
      .filter((item) => item.text.includes(lowerQuery))
      .map((item) => ({ url: item.url, meta: { title: item.title }, excerpt: escapeHtml(item.excerpt) }));
  };

  const showMoreResults = async (version) => {
    if (loadingMore || !isCurrent(version) || !currentMatches.length) return;
    const batch = currentMatches.slice(displayedCount, displayedCount + pageSize);
    if (!batch.length) return;
    loadingMore = true;
    if (loadMoreError) {
      loadMoreError.hidden = true;
      loadMoreError.textContent = "";
    }
    if (loadMoreButton) loadMoreButton.disabled = true;
    try {
      const data = await Promise.all(batch.map((match) =>
        typeof match.data === "function" ? match.data() : match
      ));
      if (!isCurrent(version)) return;
      if (searchResults) {
        searchResults.innerHTML += data.map((item) => `
          <a class="blog-search-result" href="${escapeHtml(item.url || "#")}">
            <strong>${escapeHtml(item.meta?.title || "Untitled")}</strong>
            <span>${item.excerpt || ""}</span>
          </a>
        `).join("");
      }
      displayedCount += data.length;
      if (searchSummary) searchSummary.textContent = `共找到 ${currentMatches.length} 篇笔记，已显示 ${displayedCount} 篇`;
      if (loadMoreButton) {
        const remaining = currentMatches.length - displayedCount;
        loadMoreButton.hidden = remaining <= 0;
        loadMoreButton.textContent = `查看更多（还有 ${remaining} 篇）`;
      }
    } catch {
      if (!isCurrent(version)) return;
      if (loadMoreError) {
        loadMoreError.textContent = "加载失败，请重试。";
        loadMoreError.hidden = false;
      }
      if (loadMoreButton) {
        loadMoreButton.hidden = false;
        loadMoreButton.textContent = `重试查看更多（还有 ${currentMatches.length - displayedCount} 篇）`;
      }
    } finally {
      if (isCurrent(version)) {
        loadingMore = false;
        if (loadMoreButton) loadMoreButton.disabled = false;
      }
    }
  };

  const displayMatches = async (matches, version) => {
    if (!isCurrent(version)) return;
    currentMatches = matches;
    displayedCount = 0;
    loadingMore = false;
    if (searchResults) searchResults.innerHTML = "";
    if (loadMoreError) {
      loadMoreError.hidden = true;
      loadMoreError.textContent = "";
    }
    if (loadMoreButton) {
      loadMoreButton.hidden = true;
      loadMoreButton.disabled = false;
      loadMoreButton.textContent = "查看更多";
    }
    if (!matches.length) {
      if (searchSummary) searchSummary.textContent = "共找到 0 篇笔记";
      renderSearchState("没有找到相关笔记。");
      return;
    }
    await showMoreResults(version);
  };

  let searchTimer = 0;
  let searchVersion = 0;
  const onSearch = (syncUrl = true) => {
    if (disposed || !searchInput.isConnected) return;
    const version = ++searchVersion;
    window.clearTimeout(searchTimer);
    const query = searchInput.value.trim();
    currentMatches = [];
    displayedCount = 0;
    loadingMore = false;
    if (loadMoreError) {
      loadMoreError.hidden = true;
      loadMoreError.textContent = "";
    }
    if (searchMeta) searchMeta.hidden = !query;
    if (syncUrl) updateQueryInUrl(query);
    if (loadMoreButton) {
      loadMoreButton.hidden = true;
      loadMoreButton.disabled = false;
      loadMoreButton.textContent = "查看更多";
    }
    if (!query) {
      if (searchResults) searchResults.innerHTML = "";
      if (searchSummary) searchSummary.textContent = "";
      return;
    }

    searchTimer = window.setTimeout(async () => {
      if (!isCurrent(version)) return;
      if (searchSummary) searchSummary.textContent = "正在查找...";
      renderSearchState("正在翻页...");
      try {
        const pagefind = await loadPagefind();
        if (!isCurrent(version)) return;
        const search = await pagefind.search(query);
        if (!isCurrent(version)) return;
        await displayMatches(search.results, version);
      } catch {
        if (!isCurrent(version)) return;
        await displayMatches(fallbackLocalSearch(query), version);
      }
    }, 180);
  };
  const onInput = () => onSearch(true);
  const onLoadMore = () => showMoreResults(searchVersion);
  const restoreQueryFromUrl = () => {
    if (disposed || !searchInput.isConnected) return;
    const query = new URL(window.location.href).searchParams.get("q") ?? "";
    if (searchInput && searchInput.value !== query) {
      searchInput.value = query;
      onSearch(false);
    }
  };
  searchInput?.addEventListener("input", onInput);
  loadMoreButton?.addEventListener("click", onLoadMore);
  window.addEventListener("popstate", restoreQueryFromUrl);
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    ++searchVersion;
    window.clearTimeout(searchTimer);
    searchInput.removeEventListener("input", onInput);
    loadMoreButton?.removeEventListener("click", onLoadMore);
    window.removeEventListener("popstate", restoreQueryFromUrl);
    if (mounts.get(document)?.cleanup === cleanup) mounts.delete(document);
  };
  mounts.set(document, { input: searchInput, cleanup });
  const initialQuery = new URL(window.location.href).searchParams.get("q") ?? "";
  searchInput.value = initialQuery;
  if (initialQuery) onSearch(false);
  return cleanup;
}
