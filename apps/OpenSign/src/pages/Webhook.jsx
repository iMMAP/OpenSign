import { useEffect, useState } from "react";
import Parse from "parse";
import Alert from "../primitives/Alert";
import Loader from "../primitives/Loader";
import { withSessionValidation } from "../utils";

const EVENTS = [
  { key: "document.viewed", label: "Document viewed" },
  { key: "document.signed", label: "Document signed" },
  { key: "document.completed", label: "Document completed" },
  { key: "document.declined", label: "Document declined" }
];

const Webhook = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [alertInfo, setAlertInfo] = useState({ type: "", message: "" });
  const [form, setForm] = useState({
    url: "",
    secret: "",
    events: EVENTS.map((event) => event.key)
  });
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    loadWebhook();
  }, []);

  const setAlert = (type, message) => {
    setAlertInfo({ type, message });
    setTimeout(() => setAlertInfo({ type: "", message: "" }), 2500);
  };

  const loadWebhook = withSessionValidation(async () => {
    setIsLoading(true);
    try {
      const res = await Parse.Cloud.run("getWebhook");
      setForm({
        url: res?.webhookUrl || "",
        secret: res?.webhookSecret || "",
        events: res?.webhookEvents?.length ? res.webhookEvents : EVENTS.map((event) => event.key)
      });
      setUpdatedAt(res?.updatedAt || null);
    } catch (err) {
      setAlert("danger", err.message || "Failed to load webhook settings.");
    } finally {
      setIsLoading(false);
    }
  });

  const onToggleEvent = (eventKey) => {
    setForm((prev) => {
      const exists = prev.events.includes(eventKey);
      const events = exists ? prev.events.filter((event) => event !== eventKey) : [...prev.events, eventKey];
      return { ...prev, events };
    });
  };

  const onSave = withSessionValidation(async () => {
    setIsSaving(true);
    try {
      const res = await Parse.Cloud.run("saveWebhook", {
        url: form.url,
        secret: form.secret,
        events: form.events
      });
      setUpdatedAt(res?.updatedAt || new Date().toISOString());
      setAlert("success", "Webhook settings saved.");
    } catch (err) {
      setAlert("danger", err.message || "Failed to save webhook settings.");
    } finally {
      setIsSaving(false);
    }
  });

  return (
    <div className="relative h-full bg-base-100 text-base-content flex shadow-md rounded-box overflow-auto">
      {(isLoading || isSaving) && (
        <div className="absolute bg-black bg-opacity-30 z-50 w-full h-full flex justify-center items-center">
          <Loader />
        </div>
      )}
      {alertInfo?.message && <Alert type={alertInfo.type}>{alertInfo.message}</Alert>}
      <div className="w-full p-5 md:p-6">
        <h1 className="text-xl font-semibold mb-4">Webhook</h1>
        <p className="text-sm mb-4">
          OpenSign sends signed event payloads to this URL when selected document events are triggered.
        </p>
        <div className="mb-4">
          <label className="text-sm font-semibold mb-2 block">Webhook URL</label>
          <input
            type="url"
            className="op-input op-input-bordered w-full"
            placeholder="https://internal-app.example.com/opensign/webhook"
            value={form.url}
            onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
          />
        </div>
        <div className="mb-4">
          <label className="text-sm font-semibold mb-2 block">Webhook secret (optional)</label>
          <input
            type="text"
            className="op-input op-input-bordered w-full"
            placeholder="Used for X-OpenSign-Signature HMAC verification"
            value={form.secret}
            onChange={(e) => setForm((prev) => ({ ...prev, secret: e.target.value }))}
          />
        </div>
        <div className="mb-5">
          <label className="text-sm font-semibold mb-2 block">Events</label>
          <div className="flex flex-col gap-2">
            {EVENTS.map((event) => (
              <label key={event.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="op-checkbox op-checkbox-sm"
                  checked={form.events.includes(event.key)}
                  onChange={() => onToggleEvent(event.key)}
                />
                {event.label}
              </label>
            ))}
          </div>
        </div>
        <div className="text-xs text-base-content/70 mb-4">
          Last updated: {updatedAt ? new Date(updatedAt).toLocaleString() : "-"}
        </div>
        <button className="op-btn op-btn-primary" onClick={onSave}>
          Save webhook
        </button>
      </div>
    </div>
  );
};

export default Webhook;
