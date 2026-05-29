import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useDispatch } from "react-redux";
import axios from "axios";
import Parse from "parse";
import { useTranslation } from "react-i18next";
import { showTenant } from "../redux/reducers/ShowTenant";
import { completeThirdPartyLogin } from "../utils/completeThirdPartyLogin";
import { appInfo } from "../constant/appinfo";
import { usertimezone } from "../constant/Utils";
import Loader from "../primitives/Loader";

function MicrosoftLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const hasAttemptedLogin = useRef(false);
  const [isProcessing, setIsProcessing] = useState(true);

  const redirectLoginFailed = () => {
    navigate("/?error=microsoft_login_failed", { replace: true });
  };

  const finishLogin = async (sessionToken) => {
    const locationState = {
      state: {
        from: searchParams.get("state")
          ? decodeURIComponent(searchParams.get("state"))
          : undefined,
      },
    };

    try {
      await completeThirdPartyLogin({
        sessionToken,
        navigate,
        location: locationState,
        dispatch,
        showTenant,
        t,
      });
    } catch (firstError) {
      console.warn("Post-login setup failed, retrying usersignup:", firstError);

      const baseUrl = localStorage.getItem("baseUrl");
      const parseAppId = localStorage.getItem("parseAppId");
      const meRes = await axios.get(baseUrl + "users/me", {
        headers: {
          "X-Parse-Session-Token": sessionToken,
          "X-Parse-Application-Id": parseAppId,
        },
      });

      const me = meRes.data;
      if (!me?.email) {
        throw firstError;
      }

      const randomPassword =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? `${crypto.randomUUID()}${crypto.randomUUID()}`
          : `${Date.now()}-${Math.random()}`;

      const signUpResult = await Parse.Cloud.run("usersignup", {
        userDetails: {
          name: me.name || me.username || me.email,
          email: me.email,
          phone: me.phone || "",
          role: appInfo.defaultRole || "contracts_User",
          company: "iMMAP",
          jobTitle: "Staff",
          timezone: usertimezone,
          password: randomPassword,
        },
      });

      const token =
        signUpResult?.sessionToken ||
        (signUpResult?.message === "User already exist" ? sessionToken : null);
      if (!token) {
        throw firstError;
      }
      await completeThirdPartyLogin({
        sessionToken: token,
        navigate,
        location: locationState,
        dispatch,
        showTenant,
        t,
      });
    }
  };

  useEffect(() => {
    if (hasAttemptedLogin.current) {
      return;
    }

    const code = searchParams.get("code");
    if (!code) {
      redirectLoginFailed();
      return;
    }

    const loginWithMicrosoft = async () => {
      hasAttemptedLogin.current = true;
      setIsProcessing(true);

      try {
        const result = await Parse.Cloud.run("microsoftLogin", {
          code,
          timezone: usertimezone,
        });

        const sessionToken = result?.sessionToken;
        if (!sessionToken) {
          redirectLoginFailed();
          return;
        }

        localStorage.setItem("appLogo", localStorage.getItem("appLogo") || "");
        await finishLogin(sessionToken);
      } catch (error) {
        console.error("Microsoft login error:", error);
        try {
          await Parse.User.logOut();
        } catch {
          /* ignore */
        }
        redirectLoginFailed();
      } finally {
        setIsProcessing(false);
      }
    };

    loginWithMicrosoft();
  }, [searchParams, navigate, dispatch, t]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 bg-base-200"
      aria-live="polite"
    >
      <Loader />
      <p className="text-sm text-base-content">
        {t("microsoft-login-loading")}
      </p>
      {isProcessing && null}
    </div>
  );
}

export default MicrosoftLogin;
