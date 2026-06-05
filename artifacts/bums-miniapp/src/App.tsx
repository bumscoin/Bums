import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BumsApp } from "@/pages/BumsApp";

const queryClient = new QueryClient();

const MANIFEST_URL = `${window.location.origin}${import.meta.env.BASE_URL}tonconnect-manifest.json`;

function App() {
  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
      <QueryClientProvider client={queryClient}>
        <BumsApp />
      </QueryClientProvider>
    </TonConnectUIProvider>
  );
}

export default App;
