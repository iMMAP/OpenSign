import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Parse from "parse";
import ModalUi from "../../../primitives/ModalUi";
import Loader from "../../../primitives/Loader";
import { useTranslation } from "react-i18next";

const SITE_COLORS = [
  "bg-[#038387]",
  "bg-[#0078d4]",
  "bg-[#5c2d91]",
  "bg-[#ca5010]",
  "bg-[#4f6bed]",
  "bg-[#018574]",
  "bg-[#8764b8]",
  "bg-[#00a2ad]"
];

function siteColorClass(name) {
  let hash = 0;
  for (const ch of String(name || "")) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return SITE_COLORS[hash % SITE_COLORS.length];
}

function fileExt(name) {
  const match = String(name || "")
    .toLowerCase()
    .match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : "";
}

function ItemIcon({ item }) {
  if (item.kind === "site") {
    const letter = (item.name || "?").trim().charAt(0).toUpperCase();
    return (
      <span
        className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white text-sm font-semibold ${siteColorClass(item.name)}`}
      >
        {letter}
        <i className="fa-light fa-globe absolute -bottom-0.5 -right-0.5 text-[9px] leading-none bg-white text-gray-600 rounded-full p-[1px]" />
      </span>
    );
  }
  if (item.kind === "drive") {
    return (
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-700">
        <i className="fa-light fa-hard-drive text-base" />
      </span>
    );
  }
  if (item.kind === "folder") {
    return (
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-500">
        <i className="fa-light fa-folder text-base" />
      </span>
    );
  }
  const ext = fileExt(item.name);
  if (ext === ".pdf") {
    return (
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-600">
        <i className="fa-light fa-file-pdf text-base" />
      </span>
    );
  }
  if (ext === ".docx") {
    return (
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700">
        <i className="fa-light fa-file-word text-base" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-green-50 text-green-700">
      <i className="fa-light fa-file-image text-base" />
    </span>
  );
}

function typeLabel(item, t) {
  if (item.kind === "site") return t("sharepoint-type-site");
  if (item.kind === "drive") return t("sharepoint-type-library");
  if (item.kind === "folder") return t("sharepoint-type-folder");
  const ext = fileExt(item.name).replace(".", "").toUpperCase();
  return ext || t("sharepoint-select-file");
}

function visibleCrumbs(crumbs) {
  if (crumbs.length <= 3) {
    return crumbs.map((crumb, index) => ({ crumb, index }));
  }
  return [
    { crumb: crumbs[0], index: 0 },
    { ellipsis: true },
    { crumb: crumbs[crumbs.length - 1], index: crumbs.length - 1 }
  ];
}

const SharePointBrowserModal = ({ isOpen, onClose, onSelectFile }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [listing, setListing] = useState([]);
  const [items, setItems] = useState([]);
  const [crumbs, setCrumbs] = useState([]);
  const [search, setSearch] = useState("");
  const [isLoader, setIsLoader] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [selectedSite, setSelectedSite] = useState(null);
  const searchGen = useRef(0);

  const currentLocation = useMemo(() => {
    const last = crumbs[crumbs.length - 1];
    if (!last) {
      return { siteId: "", driveId: "", itemId: "" };
    }
    if (last.kind === "site") {
      return { siteId: last.siteId || last.id, driveId: "", itemId: "" };
    }
    return {
      siteId: last.siteId || selectedSite?.id || "",
      driveId: last.driveId || "",
      itemId: last.itemId || (last.kind === "drive" ? "root" : last.id)
    };
  }, [crumbs, selectedSite]);

  const loadSites = useCallback(async () => {
    setIsLoader(true);
    setError("");
    try {
      const res = await Parse.Cloud.run("sharePointListSites", { search: "" });
      setSelectedSite(null);
      setCrumbs([]);
      setSearch("");
      const next = res?.sites || [];
      setListing(next);
      setItems(next);
    } catch (err) {
      setError(err?.message || t("sharepoint-file-error"));
      setListing([]);
      setItems([]);
    } finally {
      setIsLoader(false);
    }
  }, [t]);

  const loadStatus = useCallback(async () => {
    setIsLoader(true);
    setError("");
    try {
      const res = await Parse.Cloud.run("sharePointStatus", {
        state: `${window.location.pathname}${window.location.search}`
      });
      setStatus(res);
      if (res?.connected) {
        await loadSites();
      }
    } catch (err) {
      setError(err?.message || t("sharepoint-consent-error"));
    } finally {
      setIsLoader(false);
    }
  }, [loadSites, t]);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedSite(null);
      setCrumbs([]);
      setListing([]);
      setItems([]);
      loadStatus();
    }
  }, [isOpen, loadStatus]);

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setItems(listing);
      setIsSearching(false);
      return;
    }
    const local = listing.filter((item) =>
      String(item.name || "")
        .toLowerCase()
        .includes(q.toLowerCase())
    );
    setItems(local);
    if (!status?.connected) return undefined;

    const gen = ++searchGen.current;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await Parse.Cloud.run("sharePointSearch", {
          query: q,
          siteId: currentLocation.siteId || undefined,
          driveId: currentLocation.driveId || undefined,
          itemId: currentLocation.itemId || undefined
        });
        if (gen !== searchGen.current) return;
        const remote = res?.items || [];
        const seen = new Set(remote.map((item) => `${item.kind}-${item.id}`));
        const merged = [
          ...remote,
          ...local.filter((item) => !seen.has(`${item.kind}-${item.id}`))
        ];
        setItems(merged);
      } catch (err) {
        if (gen !== searchGen.current) return;
        setError(err?.message || t("sharepoint-file-error"));
      } finally {
        if (gen === searchGen.current) setIsSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      searchGen.current += 1;
    };
  }, [search, listing, status, currentLocation, t]);

  const handleConnect = () => {
    if (status?.consentUrl) {
      window.location.href = status.consentUrl;
    }
  };

  const openSite = async (site) => {
    setIsLoader(true);
    setError("");
    setSearch("");
    try {
      const res = await Parse.Cloud.run("sharePointListItems", {
        siteId: site.id
      });
      const next = res?.items || [];
      setSelectedSite(site);
      setCrumbs([
        { kind: "site", id: site.id, name: site.name, siteId: site.id }
      ]);
      setListing(next);
      setItems(next);
    } catch (err) {
      setError(err?.message || t("sharepoint-file-error"));
    } finally {
      setIsLoader(false);
    }
  };

  const openFolder = async (item) => {
    const driveId = item.kind === "drive" ? item.id : item.driveId;
    const itemId = item.kind === "drive" ? "root" : item.id;
    const siteId = item.siteId || selectedSite?.id;
    setIsLoader(true);
    setError("");
    setSearch("");
    try {
      const res = await Parse.Cloud.run("sharePointListItems", {
        siteId,
        driveId,
        itemId
      });
      const next = res?.items || [];
      setCrumbs((prev) => [
        ...prev,
        {
          kind: item.kind,
          id: item.id,
          name: item.name,
          driveId,
          itemId,
          siteId
        }
      ]);
      if (siteId && !selectedSite) {
        setSelectedSite({ id: siteId, name: item.siteName || "" });
      }
      setListing(next);
      setItems(next);
    } catch (err) {
      setError(err?.message || t("sharepoint-file-error"));
    } finally {
      setIsLoader(false);
    }
  };

  const goToCrumb = async (index) => {
    setSearch("");
    if (index < 0) {
      await loadSites();
      return;
    }
    const crumb = crumbs[index];
    setIsLoader(true);
    setError("");
    try {
      if (crumb.kind === "site") {
        const res = await Parse.Cloud.run("sharePointListItems", {
          siteId: crumb.siteId || crumb.id
        });
        const next = res?.items || [];
        setCrumbs(crumbs.slice(0, index + 1));
        setListing(next);
        setItems(next);
      } else {
        const res = await Parse.Cloud.run("sharePointListItems", {
          siteId: crumb.siteId,
          driveId: crumb.driveId,
          itemId: crumb.itemId
        });
        const next = res?.items || [];
        setCrumbs(crumbs.slice(0, index + 1));
        setListing(next);
        setItems(next);
      }
    } catch (err) {
      setError(err?.message || t("sharepoint-file-error"));
    } finally {
      setIsLoader(false);
    }
  };

  const handleItemClick = async (item) => {
    if (item.kind === "site") {
      await openSite(item);
      return;
    }
    if (item.kind === "drive" || item.kind === "folder") {
      await openFolder(item);
      return;
    }
    if (item.kind === "file") {
      setIsLoader(true);
      setError("");
      try {
        const file = await Parse.Cloud.run("sharePointGetFile", {
          driveId: item.driveId,
          itemId: item.id
        });
        onSelectFile({
          ...file,
          siteId: selectedSite?.id || item.siteId || "",
          siteName: selectedSite?.name || "",
          driveId: item.driveId,
          driveName:
            crumbs.find((c) => c.kind === "drive")?.name || item.driveId,
          itemId: item.id,
          parentId: file.parentId || item.parentId,
          originalFileName: file.name,
          webUrl: file.webUrl || item.webUrl
        });
      } catch (err) {
        setError(err?.message || t("sharepoint-file-error"));
      } finally {
        setIsLoader(false);
      }
    }
  };

  const crumbTrail = visibleCrumbs(crumbs);
  const lastCrumbIndex = crumbs.length - 1;

  return (
    <ModalUi
      isOpen={isOpen}
      handleClose={onClose}
      title={t("sharepoint-browse")}
      reduceWidth="md:min-w-[640px]"
    >
      <div className="px-5 pb-5 pt-2 min-h-[320px] relative">
        {isLoader && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-base-100/70">
            <Loader />
          </div>
        )}
        {status && !status.connected ? (
          <div className="flex flex-col items-start gap-3 py-6">
            <p className="text-sm text-base-content">
              {t("sharepoint-connect-help")}
            </p>
            <button
              type="button"
              className="op-btn op-btn-primary op-btn-sm"
              onClick={handleConnect}
              disabled={!status?.consentUrl}
            >
              {t("sharepoint-connect")}
            </button>
          </div>
        ) : (
          <>
            <nav
              className="flex items-center gap-1 text-xs mb-3 overflow-x-auto whitespace-nowrap"
              aria-label={t("sharepoint-sites")}
            >
              <button
                type="button"
                className={`inline-flex items-center gap-1 max-w-[180px] truncate ${
                  crumbs.length === 0
                    ? "text-base-content font-semibold"
                    : "text-primary hover:underline"
                }`}
                title={t("sharepoint-sites")}
                onClick={() => goToCrumb(-1)}
              >
                <i className="fa-light fa-globe" />
                <span className="truncate">{t("sharepoint-sites")}</span>
              </button>
              {crumbTrail.map((entry, i) =>
                entry.ellipsis ? (
                  <span
                    key={`ellipsis-${i}`}
                    className="inline-flex items-center gap-1 text-gray-400"
                  >
                    <i className="fa-light fa-chevron-right text-[10px]" />
                    <span title={crumbs.map((c) => c.name).join(" / ")}>...</span>
                  </span>
                ) : (
                  <span
                    key={`${entry.crumb.kind}-${entry.crumb.id}`}
                    className="inline-flex items-center gap-1 min-w-0"
                  >
                    <i className="fa-light fa-chevron-right text-[10px] text-gray-400" />
                    {entry.index === lastCrumbIndex ? (
                      <span
                        className="max-w-[160px] truncate font-semibold text-base-content"
                        title={entry.crumb.name}
                      >
                        {entry.crumb.name}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="max-w-[160px] truncate text-primary hover:underline"
                        title={entry.crumb.name}
                        onClick={() => goToCrumb(entry.index)}
                      >
                        {entry.crumb.name}
                      </button>
                    )}
                  </span>
                )
              )}
            </nav>
            <div className="relative mb-3">
              <i className="fa-light fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
              <input
                className="op-input op-input-bordered op-input-sm w-full text-xs pl-8"
                placeholder={t("sharepoint-search-placeholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
              {isSearching && (
                <i className="fa-light fa-spinner animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
              )}
            </div>
            {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
            {!isLoader && items.length === 0 ? (
              <p className="text-sm text-gray-500 py-6">
                {search.trim()
                  ? t("sharepoint-empty")
                  : crumbs.length === 0
                    ? t("sharepoint-no-sites")
                    : t("sharepoint-empty")}
              </p>
            ) : (
              <ul className="divide-y border rounded-box max-h-[360px] overflow-y-auto">
                {items.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-base-200 flex items-center gap-3 text-sm"
                      onClick={() => handleItemClick(item)}
                    >
                      <ItemIcon item={item} />
                      <span className="flex-1 min-w-0">
                        <span className="block break-all leading-tight">
                          {item.name}
                        </span>
                        <span className="block text-[11px] text-gray-500">
                          {typeLabel(item, t)}
                        </span>
                      </span>
                      {(item.kind === "site" ||
                        item.kind === "drive" ||
                        item.kind === "folder") && (
                        <i className="fa-light fa-chevron-right text-[10px] text-gray-400" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </ModalUi>
  );
};

export default SharePointBrowserModal;
