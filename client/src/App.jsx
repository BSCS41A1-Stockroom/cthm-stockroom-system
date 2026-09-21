import AppRoutes from "./routes/AppRoutes";
import FeedbackProvider from "./components/common/FeedbackProvider";

function App() {
  return <FeedbackProvider><AppRoutes /></FeedbackProvider>;
}

export default App;
