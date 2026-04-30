import { useEffect, useState } from "react";
import Parse from "parse";
import Alert from "../primitives/Alert";
import Loader from "../primitives/Loader";
import { withSessionValidation } from "../utils";

const ApiToken = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [tokenMeta, setTokenMeta] = useState({
    enabled: false,
    preview: null,
    createdAt: null,
    lastUsedAt: null
  });
  const [newToken, setNewToken] = useState("");
  const [alertInfo, setAlertInfo] = useState({ type: "", message: "" });

  useEffect(() => {
    loadToken();
  }, []);

  const setAlert = (type, message) => {
    setAlertInfo({ type, message });
    setTimeout(() => setAlertInfo({ type: "", message: "" }), 2500);
  };

  const loadToken = withSessionValidation(async () => {
    setIsLoading(true);
    try {
      const data = await Parse.Cloud.run("getApiToken");
      setTokenMeta(data || {});
    } catch (err) {
      setAlert("danger", err.message || "Failed to load token metadata.");
    } finally {
      setIsLoading(false);
    }
  });

  const handleGenerate = withSessionValidation(async () => {
    setIsSaving(true);
    try {
      const res = await Parse.Cloud.run("generateApiToken");
      setNewToken(res?.token || "");
      setTokenMeta({
        enabled: true,
        preview: res?.preview || null,
        createdAt: res?.createdAt || new Date().toISOString(),
        lastUsedAt: null
      });
      setAlert("success", "API token generated. Copy it now; it is shown only once.");
    } catch (err) {
      setAlert("danger", err.message || "Failed to generate API token.");
    } finally {
      setIsSaving(false);
    }
  });

  const handleRevoke = withSessionValidation(async () => {
    setIsSaving(true);
    try {
      await Parse.Cloud.run("revokeApiToken");
      setTokenMeta({ enabled: false, preview: null, createdAt: null, lastUsedAt: null });
      setNewToken("");
      setAlert("success", "API token revoked.");
    } catch (err) {
      setAlert("danger", err.message || "Failed to revoke API token.");
    } finally {
      setIsSaving(false);
    }
  });

  const handleCopy = async () => {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setAlert("success", "Token copied to clipboard.");
  };

  const renderDate = (value) => (value ? new Date(value).toLocaleString() : "-");

  return (
    <div className="relative h-full bg-base-100 text-base-content flex shadow-md rounded-box overflow-auto">
      {(isLoading || isSaving) && (
        <div className="absolute bg-black bg-opacity-30 z-50 w-full h-full flex justify-center items-center">
          <Loader />
        </div>
      )}
      {alertInfo?.message && <Alert type={alertInfo.type}>{alertInfo.message}</Alert>}
      <div className="w-full p-5 md:p-6">
        <h1 className="text-xl font-semibold mb-4">API Token</h1>
        <p className="text-sm mb-4">
          Use this token from internal apps in <code>X-Api-Token</code> header.
        </p>

        <div className="border rounded-box p-4 mb-4">
          <div className="text-sm mb-2">
            <span className="font-semibold">Status:</span>{" "}
            {tokenMeta?.enabled ? "Active" : "Not configured"}
          </div>
          <div className="text-sm mb-2">
            <span className="font-semibold">Current token:</span> {tokenMeta?.preview || "-"}
          </div>
          <div className="text-sm mb-2">
            <span className="font-semibold">Created at:</span> {renderDate(tokenMeta?.createdAt)}
          </div>
          <div className="text-sm">
            <span className="font-semibold">Last used at:</span> {renderDate(tokenMeta?.lastUsedAt)}
          </div>
        </div>

        {newToken && (
          <div className="border rounded-box p-4 mb-4 bg-base-200">
            <div className="font-semibold mb-2">New Token (visible once)</div>
            <div className="break-all text-sm mb-3">{newToken}</div>
            <button className="op-btn op-btn-secondary op-btn-sm" onClick={handleCopy}>
              Copy token
            </button>
          </div>
        )}

        <div className="flex gap-3">
          <button className="op-btn op-btn-primary" onClick={handleGenerate}>
            Generate new token
          </button>
          <button className="op-btn op-btn-outline" onClick={handleRevoke}>
            Revoke token
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiToken;
