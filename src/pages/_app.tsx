import "@/styles/globals.css";
import "react-toastify/dist/ReactToastify.css";
import "react-tooltip/dist/react-tooltip.css";
import type { AppProps } from "next/app";
import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { ToastContainer } from "react-toastify";
import { getSession } from "@/utils/authSession";
import { LoaderProvider } from "@/components/Loader/LoaderProvider";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    const publicRoutes = ["/login", "/register"];
    const path = router.pathname;
    const isPublic = publicRoutes.some(
      (route) => path === route || path.startsWith(`${route}/`)
    );
    const sessionUser = getSession();

    if (!sessionUser && !isPublic) {
      router.replace("/login");
    }
  }, [router]);

  return <>{children}</>;
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        {/* 🌐 Basic Meta */}
        <title>Educators360 | AI Job Search | AI Interview</title>
        <meta
          name="description"
          content="Educators360 empowers students and educators through innovative learning experiences."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        {/* 🧩 Favicon & Icons */}
        <link rel="icon" href="/favicon.png" />
        <link rel="manifest" href="/site.webmanifest" />

        {/* 🎨 Theme color for mobile browser UI */}
        <meta name="theme-color" content="#8f0500" />
      </Head>

      <LoaderProvider>
        <AuthGuard>
          <Component {...pageProps} />
        </AuthGuard>
        <ToastContainer position="bottom-center" autoClose={3000} pauseOnHover theme="dark" />
      </LoaderProvider>
    </>
  );
}
