import Home from "@/Pages/Home";
import { RAGProvider } from "@/context/RAGContext";
import { ThemeProvider } from "@/context/ThemeContext";

export default function App() {
  return (
    <ThemeProvider>
      <RAGProvider>
        <div className="h-screen bg-slate-50 dark:bg-dark-gradient">
          <Home />
        </div>
      </RAGProvider>
    </ThemeProvider>
  );
}
