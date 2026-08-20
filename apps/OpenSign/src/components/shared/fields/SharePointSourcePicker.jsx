import { useState } from "react";
import { useTranslation } from "react-i18next";
import SharePointBrowserModal from "./SharePointBrowserModal";

const SharePointSourcePicker = ({
  fileSource,
  onFileSourceChange,
  sharePointSource,
  onSharePointFile,
  disabled
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="text-xs mb-2">
      <label className="block mb-1">{t("file-source")}</label>
      <div className="flex flex-wrap gap-3 mb-2">
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="radio"
            name="fileSource"
            className="op-radio op-radio-xs op-radio-primary"
            checked={fileSource === "upload"}
            onChange={() => onFileSourceChange("upload")}
            disabled={disabled}
          />
          {t("file-source-upload")}
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="radio"
            name="fileSource"
            className="op-radio op-radio-xs op-radio-primary"
            checked={fileSource === "sharepoint"}
            onChange={() => onFileSourceChange("sharepoint")}
            disabled={disabled}
          />
          {t("file-source-sharepoint")}
        </label>
      </div>
      {fileSource === "sharepoint" && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="op-btn op-btn-secondary op-btn-sm"
            onClick={() => setIsOpen(true)}
            disabled={disabled}
          >
            {t("sharepoint-browse")}
          </button>
          {sharePointSource?.originalFileName && (
            <span className="text-gray-500">
              {t("sharepoint-selected")}: {sharePointSource.originalFileName}
            </span>
          )}
        </div>
      )}
      <SharePointBrowserModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelectFile={(file) => {
          setIsOpen(false);
          onSharePointFile(file);
        }}
      />
    </div>
  );
};

export default SharePointSourcePicker;
