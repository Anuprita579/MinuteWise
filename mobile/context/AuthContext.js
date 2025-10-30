import React, { createContext, useState, useContext, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "../config/supabase";

WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState(null);

  useEffect(() => {
    checkAuth();
    setupDeepLinkListener();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("🔔 Auth event:", event);

        if (event === "SIGNED_IN" && session) {
          console.log("✅ User signed in");
          await handleSessionChange(session);
        } else if (event === "SIGNED_OUT") {
          console.log("👋 User signed out");
          setUser(null);
          setToken(null);
        } else if (event === "TOKEN_REFRESHED" && session) {
          console.log("🔄 Token refreshed");
          setToken(session.access_token);
        }
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const setupDeepLinkListener = async () => {
    // Handle app open from deep link
    const url = await Linking.getInitialURL();
    if (url != null) {
      console.log("🔗 App opened from deep link:", url);
      handleDeepLink(url);
    }

    // Listen for deep links while app is open
    const subscription = Linking.addEventListener("url", ({ url }) => {
      console.log("🔗 Deep link received while app open:", url);
      handleDeepLink(url);
    });

    return () => {
      subscription.remove();
    };
  };

  const handleDeepLink = async (url) => {
    console.log("📍 Processing URL:", url);

    try {
      // Parse the hash fragment
      const hash = url.split("#")[1];
      if (!hash) {
        console.log("⚠️ No hash fragment in URL");
        return;
      }

      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");

      console.log("🔐 URL params - Type:", type, "Access token:", !!accessToken);

      // Handle password reset/recovery
      if ((type === "recovery" || type === "signup") && accessToken && refreshToken) {
        console.log("🔑 Recovery/Signup token detected");

        // Set the session to get user info
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          console.error("❌ Error setting session:", error);
          return;
        }

        if (data.session?.user) {
          console.log("✅ Session set for user:", data.session.user.email);
          console.log("   User has password:", !!data.session.user.user_metadata?.has_password);

          const userEmail = data.session.user.email;
          
          // Check if this user already has a password
          const { data: userData, error: userError } = await supabase.auth.getUser();
          
          if (type === "recovery") {
            // Password reset flow - user is trying to set password for Google account
            console.log("🔄 Starting password recovery flow");
            setRecoveryEmail(userEmail);
            setIsRecoveringPassword(true);
            
            // Save tokens for password update
            await AsyncStorage.setItem("recovery_access_token", accessToken);
            await AsyncStorage.setItem("recovery_refresh_token", refreshToken);
          } else if (type === "signup") {
            // Normal signup confirmation
            console.log("✅ Email verified from signup");
            await handleSessionChange(data.session);
          }
        }
      }
    } catch (error) {
      console.error("❌ Deep link error:", error);
    }
  };

  const handleSessionChange = async (session) => {
    const userData = {
      id: session.user.id,
      email: session.user.email,
      name:
        session.user.user_metadata?.full_name ||
        session.user.user_metadata?.name ||
        session.user.email?.split("@")[0],
      avatar: session.user.user_metadata?.avatar_url,
      provider: session.user.app_metadata?.provider || "email",
    };

    setToken(session.access_token);
    setUser(userData);

    // Persist session
    await AsyncStorage.setItem("auth_token", session.access_token);
    await AsyncStorage.setItem("user_data", JSON.stringify(userData));
    await AsyncStorage.setItem("session_data", JSON.stringify(session));

    console.log("✅ Session stored");
  };

  const checkAuth = async () => {
    try {
      console.log("🔍 Checking authentication...");

      // First check for recovery session
      const recoveryToken = await AsyncStorage.getItem("recovery_access_token");
      if (recoveryToken) {
        console.log("🔑 Found recovery token in storage");
        const refreshToken = await AsyncStorage.getItem("recovery_refresh_token");
        
        const { data, error } = await supabase.auth.setSession({
          access_token: recoveryToken,
          refresh_token: refreshToken,
        });

        if (!error && data.session?.user?.email) {
          console.log("✅ Recovery session restored");
          setRecoveryEmail(data.session.user.email);
          setIsRecoveringPassword(true);
          setLoading(false);
          return;
        } else {
          await AsyncStorage.removeItem("recovery_access_token");
          await AsyncStorage.removeItem("recovery_refresh_token");
        }
      }

      // Check for active session
      const { data: { session }, error } = await supabase.auth.getSession();

      if (session) {
        console.log("✅ Active session found");
        await handleSessionChange(session);
      } else {
        // Try to restore from AsyncStorage
        const storedData = await AsyncStorage.getItem("session_data");
        if (storedData) {
          const storedSession = JSON.parse(storedData);
          const { data, error } = await supabase.auth.setSession({
            access_token: storedSession.access_token,
            refresh_token: storedSession.refresh_token,
          });

          if (!error && data.session) {
            console.log("✅ Session restored from storage");
            await handleSessionChange(data.session);
          } else {
            console.log("❌ Stored session invalid");
            await AsyncStorage.clear();
          }
        }
      }
    } catch (error) {
      console.error("❌ Auth check error:", error);
      await AsyncStorage.clear();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      console.log("🔐 Login:", email);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("❌ Login error:", error.message);
        return { success: false, error: error.message };
      }

      console.log("✅ Login success");
      return { success: true };
    } catch (error) {
      console.error("❌ Login error:", error.message);
      return { success: false, error: error.message };
    }
  };

  const signUp = async (email, password, name) => {
    try {
      console.log("📝 Sign up:", email);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name: name || email.split("@")[0] },
          emailRedirectTo: Linking.createURL("/"),
        },
      });

      if (error) {
        console.error("❌ Sign up error:", error.message);

        if (error.message.includes("already registered")) {
          return {
            success: false,
            error: "Email already registered. Use password reset.",
            showResetPassword: true,
            email,
          };
        }

        return { success: false, error: error.message };
      }

      // Check if account exists with different provider
      if (data.user?.identities?.length === 0) {
        console.log("⚠️ Account exists with different provider");
        return {
          success: false,
          error: "This email already exists. Please reset your password to set email login.",
          showResetPassword: true,
          email,
        };
      }

      if (data.user && !data.session) {
        return {
          success: true,
          requiresConfirmation: true,
          message: "Check your email to verify.",
        };
      }

      return { success: true };
    } catch (error) {
      console.error("❌ Sign up error:", error.message);
      return { success: false, error: error.message };
    }
  };

  const resetPassword = async (email) => {
    try {
      console.log("🔐 Reset password for:", email);

      const redirectUrl = Linking.createURL("/");
      console.log("📱 Redirect URL:", redirectUrl);

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        console.error("❌ Reset error:", error);
        throw error;
      }

      return {
        success: true,
        message: "Check your email for password reset link.",
      };
    } catch (error) {
      console.error("❌ Reset password error:", error.message);
      return { success: false, error: error.message };
    }
  };

  const updatePassword = async (newPassword) => {
    try {
      console.log("🔐 Updating password...");

      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (!session) {
        console.error("❌ No session for password update");
        return {
          success: false,
          error: "Session expired. Please click the reset link again.",
        };
      }

      console.log("✅ Session found, updating password for:", session.user.email);

      // Update password
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        console.error("❌ Update error:", error);
        throw error;
      }

      console.log("✅ Password updated successfully");

      // Clear recovery tokens
      await AsyncStorage.removeItem("recovery_access_token");
      await AsyncStorage.removeItem("recovery_refresh_token");

      // Sign out so user can login with new password
      await supabase.auth.signOut();

      setIsRecoveringPassword(false);
      setRecoveryEmail(null);
      setUser(null);
      setToken(null);

      return { success: true };
    } catch (error) {
      console.error("❌ Password update error:", error.message);
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      console.log("👋 Logging out...");
      await supabase.auth.signOut();
      await AsyncStorage.clear();

      setUser(null);
      setToken(null);
      setIsRecoveringPassword(false);
      setRecoveryEmail(null);

      console.log("✅ Logged out");
    } catch (error) {
      console.error("❌ Logout error:", error);
    }
  };

  const value = {
    user,
    token,
    loading,
    login,
    signUp,
    logout,
    resetPassword,
    updatePassword,
    isAuthenticated: !!user && !isRecoveringPassword,
    isRecoveringPassword,
    recoveryEmail,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};