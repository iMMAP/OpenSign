import { useCallback, useEffect, useState } from "react";
import Parse from "parse";
import ModalUi from "../../../primitives/ModalUi";
import Loader from "../../../primitives/Loader";
import { useTranslation } from "react-i18next";

const SharePointBrowserModal = ({ isOpen, onClose, onSelectFile }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [crumbs, setCrumbs] = useState([]);
  const [search, setSearch] = useState("");
  const [isLoader, setIsLoader] = useState(false);
  const [error, setError] = useState("");
  const [selectedSite, setSelectedSite] = useState(null);

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
  }, [t]);

  const loadSites = async (query = "") => {
    setIsLoader(true);
    setError("");
    try {
      const res = await Parse.Cloud.run("sharePointListSites", {
        search: query
      });
      setSelectedSite(null);
      setCrumbs([]);
      setItems(res?.sites || []);
    } catch (err) {
      setError(err?.message || t("sharepoint-file-error"));
      setItems([]);
    } finally {
      setIsLoader(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedSite(null);
      setCrumbs([]);
      setItems([]);
      loadStatus();
    }
  }, [isOpen, loadStatus]);

  const handleConnect = () => {
    if (status?.consentUrl) {
      window.location.href = status.consentUrl;
    }
  };

  const openSite = async (site) => {
    setIsLoader(true);
    setError("");
    try {
      const res = await Parse.Cloud.run("sharePointListItems", {
        siteId: site.id
      });
      setSelectedSite(site);
      setCrumbs([{ kind: "site", id: site.id, name: site.name, siteId: site.id }]);
      setItems(res?.items || []);
    } catch (err) {
      setError(err?.message || t("sharepoint-file-error"));
    } finally {
      setIsLoader(false);
    }
  };

  const openFolder = async (item) => {
    const driveId = item.kind === "drive" ? item.id : item.driveId;
    const itemId = item.kind === "drive" ? "root" : item.id;
    setIsLoader(true);
    setError("");
    try {
      const res = await Parse.Cloud.run("sharePointListItems", {
        siteId: selectedSite?.id,
        driveId,
        itemId
      });
      setCrumbs((prev) => [
        ...prev,
        {
          kind: item.kind,
          id: item.id,
          name: item.name,
          driveId,
          itemId,
          siteId: selectedSite?.id
        }
      ]);
      setItems(res?.items || []);
    } catch (err) {
      setError(err?.message || t("sharepoint-file-error"));
    } finally {
      setIsLoader(false);
    }
  };

  const goToCrumb = async (index) => {
    if (index < 0) {
      await loadSites(search);
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
        setCrumbs(crumbs.slice(0, index + 1));
        setItems(res?.items || []);
      } else {
        const res = await Parse.Cloud.run("sharePointListItems", {
          siteId: crumb.siteId,
          driveId: crumb.driveId,
          itemId: crumb.itemId
        });
        setCrumbs(crumbs.slice(0, index + 1));
        setItems(res?.items || []);
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
          siteId: selectedSite?.id || "",
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

  const handleSearch = async (e) => {
    e.preventDefault();
    await loadSites(search);
  };

  const iconFor = (item) => {
    if (item.kind === "site") return "fa-light fa-building";
    if (item.kind === "drive") return "fa-light fa-database";
    if (item.kind === "folder") return "fa-light fa-folder";
    return "fa-light fa-file";
  };

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
            {crumbs.length === 0 && (
              <form onSubmit={handleSearch} className="mb-3 flex gap-2">
                <input
                  className="op-input op-input-bordered op-input-sm w-full text-xs"
                  placeholder={t("sharepoint-search-sites")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button type="submit" className="op-btn op-btn-primary op-btn-sm">
                  {t("search")}
                </button>
              </form>
            )}
            <div className="text-xs mb-2 break-all">
              <button
                type="button"
                className="op-link op-link-primary"
                onClick={() => goToCrumb(-1)}
              >
                {t("sharepoint-sites")}
              </button>
              {crumbs.map((crumb, index) => (
                <span key={`${crumb.kind}-${crumb.id}`}>
                  {" / "}
                  <button
                    type="button"
                    className="op-link op-link-primary"
                    onClick={() => goToCrumb(index)}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>
            {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
            {!isLoader && items.length === 0 ? (
              <p className="text-sm text-gray-500 py-6">
                {crumbs.length === 0
                  ? t("sharepoint-no-sites")
                  : t("sharepoint-empty")}
              </p>
            ) : (
              <ul className="divide-y border rounded-box max-h-[360px] overflow-y-auto">
                {items.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-base-200 flex items-center gap-2 text-sm"
                      onClick={() => handleItemClick(item)}
                    >
                      <i className={`${iconFor(item)} text-base`} />
                      <span className="flex-1 break-all">{item.name}</span>
                      {item.kind === "file" && (
                        <span className="text-[11px] text-gray-500">
                          {t("sharepoint-select-file")}
                        </span>
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
