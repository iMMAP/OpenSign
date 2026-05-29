import Parse from "parse";
import axios from "axios";
import { appInfo } from "../constant/appinfo";

export function setLoginLocalVar(user) {
  localStorage.setItem("accesstoken", user.sessionToken);
  localStorage.setItem("UserInformation", JSON.stringify(user));
  localStorage.setItem("userEmail", user.email);
  if (user.ProfilePic) {
    localStorage.setItem("profileImg", user.ProfilePic);
  } else {
    localStorage.setItem("profileImg", "");
  }
}

/**
 * Finish OAuth login: establish Parse session and redirect by role.
 */
export async function completeThirdPartyLogin({
  sessionToken,
  navigate,
  location,
  dispatch,
  showTenant,
  t,
}) {
  const baseUrl = localStorage.getItem("baseUrl");
  const parseAppId = localStorage.getItem("parseAppId");
  const res = await axios.get(baseUrl + "users/me", {
    headers: {
      "X-Parse-Session-Token": sessionToken,
      "X-Parse-Application-Id": parseAppId,
    },
  });

  await Parse.User.become(sessionToken);
  window.localStorage.setItem("accesstoken", sessionToken);

  if (!res.data) {
    throw new Error(t("something-went-wrong-mssg"));
  }

  setLoginLocalVar(res.data);

  const userSettings = appInfo.settings;
  const extUser = await Parse.Cloud.run("getUserDetails");

  if (!extUser) {
    throw new Error(t("user-not-found"));
  }

  const isDisabled = extUser?.get("IsDisabled") || false;
  if (isDisabled) {
    throw new Error(t("do-not-access-contact-admin"));
  }

  const userRole = extUser?.get("UserRole");
  const menu = userRole && userSettings.find((m) => m.role === userRole);
  if (!menu) {
    throw new Error(t("role-not-found"));
  }

  const stateRedirect = location?.state?.from;
  const queryState =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("state")
      : null;
  const redirectUrl =
    stateRedirect ||
    (queryState ? decodeURIComponent(queryState) : null) ||
    `/${menu.pageType}/${menu.pageId}`;

  const role = userRole.replace("contracts_", "");
  const extInfo = JSON.parse(JSON.stringify(extUser));
  localStorage.setItem("_user_role", role);
  localStorage.setItem("Extand_Class", JSON.stringify([extUser]));
  localStorage.setItem("userEmail", extInfo?.Email);
  localStorage.setItem("username", extInfo?.Name);

  if (extInfo?.TenantId) {
    const tenant = {
      Id: extInfo?.TenantId?.objectId || "",
      Name: extInfo?.TenantId?.TenantName || "",
    };
    localStorage.setItem("TenantId", tenant?.Id);
    dispatch(showTenant(tenant?.Name));
    localStorage.setItem("TenantName", tenant?.Name);
  }

  localStorage.setItem("PageLanding", menu.pageId);
  localStorage.setItem("defaultmenuid", menu.menuId);
  localStorage.setItem("pageType", menu.pageType);
  navigate(redirectUrl);
}
