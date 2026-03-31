import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider } from "./firebase";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const INDUSTRIES = {
  personal: { label: "Personal", icon: "◎", color: "#7C6FF7" },
  finance: { label: "Finance", icon: "◈", color: "#22C55E" },
  education: { label: "Education", icon: "◉", color: "#3B82F6" },
  agriculture: { label: "Agriculture", icon: "◆", color: "#84CC16" },
  healthcare: { label: "Healthcare", icon: "◇", color: "#EF4444" },
};

const INDUSTRY_TEMPLATES = {
  finance: [
    { title: "Review monthly budget", category: "priority", tags: ["finance", "budget"] },
    { title: "Pay credit card bill", category: "priority", tags: ["finance", "bills"] },
    { title: "Check investment portfolio", category: "regular", tags: ["finance", "invest"] },
    { title: "Expense report submission", category: "custom", tags: ["finance", "work"] },
  ],
  education: [
    { title: "Complete assignment draft", category: "priority", tags: ["study", "assignment"] },
    { title: "Review lecture notes", category: "regular", tags: ["study", "review"] },
    { title: "Prepare for exam", category: "priority", tags: ["study", "exam"] },
    { title: "Research paper outline", category: "custom", tags: ["study", "research"] },
  ],
  agriculture: [
    { title: "Irrigation check – Field A", category: "priority", tags: ["farm", "water"] },
    { title: "Fertilizer application schedule", category: "regular", tags: ["farm", "soil"] },
    { title: "Crop health inspection", category: "regular", tags: ["farm", "crops"] },
    { title: "Harvest planning", category: "custom", tags: ["farm", "harvest"] },
  ],
  healthcare: [
    { title: "Patient follow-up calls", category: "priority", tags: ["health", "patients"] },
    { title: "Medical supply inventory", category: "regular", tags: ["health", "supplies"] },
    { title: "Staff shift schedule review", category: "regular", tags: ["health", "admin"] },
    { title: "Compliance documentation", category: "custom", tags: ["health", "compliance"] },
  ],
  personal: [
    { title: "Morning workout", category: "regular", tags: ["health", "routine"] },
    { title: "Read 30 minutes", category: "regular", tags: ["learning", "habit"] },
    { title: "Weekly planning session", category: "priority", tags: ["productivity"] },
    { title: "Call family", category: "custom", tags: ["personal", "social"] },
  ],
};

const PRIORITY_COLORS = { high: "#EF4444", medium: "#F59E0B", low: "#22C55E" };
const PRIORITY_BG = { high: "#FEF2F2", medium: "#FFFBEB", low: "#F0FDF4" };
const CATEGORY_COLORS = { priority: "#7C6FF7", regular: "#3B82F6", custom: "#EC4899" };

const KANBAN_COLS = [
  { id: "todo", label: "To Do", color: "#64748B" },
  { id: "inprogress", label: "In Progress", color: "#3B82F6" },
  { id: "done", label: "Done", color: "#22C55E" },
];

const MOODS = ["😫", "😕", "😐", "😊", "🚀"];

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(d) {
  if (!d) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const due = new Date(d + "T00:00:00");
  return Math.ceil((due - now) / 86400000);
}

// ─── SEED DATA ────────────────────────────────────────────────────────────────

const SEED_TASKS = [
  { id: "t1", title: "Q2 Budget Review", desc: "Analyze Q2 spend and prepare variance report", category: "priority", priority: "high", status: "inprogress", deadline: today(), tags: ["finance", "review"], subtasks: [{ id: "s1", title: "Collect department reports", done: true }, { id: "s2", title: "Build variance chart", done: false }], industry: "finance", createdAt: Date.now() - 86400000 * 2, completedAt: null, timeSpent: 45, recurrence: "monthly", pomodoros: 2 },
  { id: "t2", title: "Morning Workout", desc: "30 min cardio + strength training", category: "regular", priority: "medium", status: "todo", deadline: today(), tags: ["health", "routine"], subtasks: [], industry: "personal", createdAt: Date.now() - 86400000, completedAt: null, timeSpent: 0, recurrence: "daily", pomodoros: 0 },
  { id: "t3", title: "Read Research Paper", desc: "Read and summarize the neural scaling paper", category: "custom", priority: "low", status: "todo", deadline: "", tags: ["learning", "research"], subtasks: [{ id: "s3", title: "Download PDF", done: true }], industry: "education", createdAt: Date.now() - 3600000 * 5, completedAt: null, timeSpent: 20, recurrence: "none", pomodoros: 1 },
  { id: "t4", title: "Irrigation Schedule", desc: "Set irrigation timers for all zones", category: "regular", priority: "high", status: "done", deadline: today(), tags: ["farm", "water"], subtasks: [], industry: "agriculture", createdAt: Date.now() - 86400000 * 3, completedAt: Date.now() - 3600000 * 2, timeSpent: 60, recurrence: "weekly", pomodoros: 3 },
  { id: "t5", title: "Patient Follow-Up", desc: "Call patients from Tuesday's clinic", category: "priority", priority: "high", status: "todo", deadline: today(), tags: ["health", "patients"], subtasks: [{ id: "s4", title: "Mr. Ahmed - med check", done: false }, { id: "s5", title: "Mrs. Priya - lab results", done: false }], industry: "healthcare", createdAt: Date.now() - 3600000 * 8, completedAt: null, timeSpent: 0, recurrence: "none", pomodoros: 0 },
  { id: "t6", title: "Weekly Planning", desc: "Plan goals and priorities for the week", category: "custom", priority: "medium", status: "done", deadline: "", tags: ["productivity"], subtasks: [], industry: "personal", createdAt: Date.now() - 86400000 * 7, completedAt: Date.now() - 86400000 * 6, timeSpent: 30, recurrence: "weekly", pomodoros: 1 },
];

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

function Dashboard({ user, onLogout }) {
  const [tasks, setTasks] = useState(() => {
    try { const s = localStorage.getItem("tfp_tasks"); return s ? JSON.parse(s) : SEED_TASKS; }
    catch { return SEED_TASKS; }
  });
  const [view, setView] = useState("board"); // board | list | calendar | analytics
  const [theme, setTheme] = useState("light");
  const [industry, setIndustry] = useState("personal");
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [showAI, setShowAI] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [pomodoroActive, setPomodoroActive] = useState(false);
  const [pomodoroSec, setPomodoroSec] = useState(25 * 60);
  const [pomodoroTask, setPomodoroTask] = useState(null);
  const [mood, setMood] = useState(3);
  const [showMoodBar, setShowMoodBar] = useState(false);
  const [dragTask, setDragTask] = useState(null);
  const [notification, setNotification] = useState(null);
  const [goalModal, setGoalModal] = useState(false);
  const [goals, setGoals] = useState([{ id: "g1", title: "Achieve inbox zero", progress: 60, type: "short" }, { id: "g2", title: "Read 12 books this year", progress: 25, type: "long" }]);
  const [voiceActive, setVoiceActive] = useState(false);

  const pomTimer = useRef(null);

  // Persist tasks
  useEffect(() => {
    try { localStorage.setItem("tfp_tasks", JSON.stringify(tasks)); } catch {}
  }, [tasks]);

  // Pomodoro timer
  useEffect(() => {
    if (pomodoroActive) {
      pomTimer.current = setInterval(() => {
        setPomodoroSec(s => {
          if (s <= 1) {
            clearInterval(pomTimer.current);
            setPomodoroActive(false);
            notify("🍅 Pomodoro complete! Take a break.");
            if (pomodoroTask) {
              setTasks(ts => ts.map(t => t.id === pomodoroTask ? { ...t, pomodoros: (t.pomodoros || 0) + 1, timeSpent: (t.timeSpent || 0) + 25 } : t));
            }
            return 25 * 60;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      clearInterval(pomTimer.current);
    }
    return () => clearInterval(pomTimer.current);
  }, [pomodoroActive, pomodoroTask]);

  function notify(msg) {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  }

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (filterCat !== "all" && t.category !== filterCat) return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (searchQ && !t.title.toLowerCase().includes(searchQ.toLowerCase()) && !t.tags?.some(g => g.includes(searchQ.toLowerCase()))) return false;
      return true;
    });
  }, [tasks, filterCat, filterStatus, filterPriority, searchQ]);

  function addTask(data) {
    const newTask = { id: generateId(), createdAt: Date.now(), completedAt: null, timeSpent: 0, pomodoros: 0, subtasks: [], status: "todo", ...data };
    setTasks(ts => [newTask, ...ts]);
    notify("Task created!");
  }

  function updateTask(id, data) {
    setTasks(ts => ts.map(t => t.id === id ? { ...t, ...data, completedAt: data.status === "done" && t.status !== "done" ? Date.now() : t.completedAt } : t));
  }

  function deleteTask(id) {
    setTasks(ts => ts.filter(t => t.id !== id));
    notify("Task deleted.");
  }

  function loadTemplate() {
    const tpls = INDUSTRY_TEMPLATES[industry] || [];
    const newTasks = tpls.map(t => ({ id: generateId(), createdAt: Date.now(), completedAt: null, timeSpent: 0, pomodoros: 0, subtasks: [], status: "todo", priority: "medium", deadline: "", desc: "", recurrence: "none", industry, ...t }));
    setTasks(ts => [...newTasks, ...ts]);
    notify(`Loaded ${tpls.length} ${INDUSTRIES[industry].label} templates!`);
  }

  // Voice recognition
  function startVoice() {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      notify("Voice not supported in this browser.");
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US";
    rec.onstart = () => setVoiceActive(true);
    rec.onend = () => setVoiceActive(false);
    rec.onresult = (e) => {
      const txt = e.results[0][0].transcript;
      setEditTask({ title: txt, category: "custom", priority: "medium", deadline: "", desc: "", tags: [], industry, recurrence: "none" });
      setShowModal(true);
    };
    rec.start();
  }

  // AI Chat
  async function sendAIMessage() {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg = aiInput.trim();
    setAiInput("");
    const newMsgs = [...aiMessages, { role: "user", content: userMsg }];
    setAiMessages(newMsgs);
    setAiLoading(true);

    const taskSummary = tasks.slice(0, 10).map(t => `- ${t.title} (${t.priority} priority, ${t.status}, deadline: ${t.deadline || "none"})`).join("\n");
    const systemPrompt = `You are TaskFlow Pro, an intelligent productivity assistant. The user has these tasks:\n${taskSummary}\n\nHelp them with task management, prioritization, productivity tips, and scheduling. Be concise and actionable. Current industry context: ${industry}. Today's date: ${today()}.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data.content?.map(b => b.text || "").join("") || "Sorry, I couldn't respond.";
      setAiMessages(m => [...m, { role: "assistant", content: reply }]);
    } catch {
      setAiMessages(m => [...m, { role: "assistant", content: "Connection error. Please try again." }]);
    }
    setAiLoading(false);
  }

  async function getAIPrioritySuggestion(task) {
    notify("Analyzing task priority with AI...");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 200,
          messages: [{ role: "user", content: `Given this task: "${task.title}" with deadline "${task.deadline || 'none'}", current status "${task.status}", and tags "${task.tags?.join(', ')}", suggest the best priority (high/medium/low) and give a one-sentence reason. Reply in JSON: {"priority":"high|medium|low","reason":"..."}` }],
        }),
      });
      const data = await res.json();
      const text = data.content?.map(b => b.text || "").join("") || "{}";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      updateTask(task.id, { priority: parsed.priority });
      notify(`AI suggests: ${parsed.priority} priority — ${parsed.reason}`);
    } catch {
      notify("AI priority suggestion failed.");
    }
  }

  // Analytics
  const analytics = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter(t => t.status === "done").length;
    const overdue = tasks.filter(t => t.deadline && daysUntil(t.deadline) < 0 && t.status !== "done").length;
    const totalTime = tasks.reduce((s, t) => s + (t.timeSpent || 0), 0);
    const byPriority = { high: 0, medium: 0, low: 0 };
    tasks.forEach(t => byPriority[t.priority] = (byPriority[t.priority] || 0) + 1);
    const byCat = { priority: 0, regular: 0, custom: 0 };
    tasks.forEach(t => byCat[t.category] = (byCat[t.category] || 0) + 1);
    const productivityScore = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, overdue, totalTime, byPriority, byCat, productivityScore };
  }, [tasks]);

  const dark = theme === "dark";
  const bg = dark ? "#0F172A" : "#F8FAFC";
  const surface = dark ? "#1E293B" : "#FFFFFF";
  const border = dark ? "#334155" : "#E2E8F0";
  const text = dark ? "#F1F5F9" : "#0F172A";
  const textMuted = dark ? "#94A3B8" : "#64748B";
  const cardBg = dark ? "#1E293B" : "#FFFFFF";

  // Drag and drop handlers
  function onDragStart(e, taskId) { setDragTask(taskId); e.dataTransfer.effectAllowed = "move"; }
  function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
  function onDrop(e, targetStatus) {
    e.preventDefault();
    if (dragTask) { updateTask(dragTask, { status: targetStatus }); setDragTask(null); }
  }

  const styles = {
    app: { minHeight: "100vh", background: bg, color: text, fontFamily: "'DM Sans', 'Segoe UI', sans-serif", transition: "all 0.3s ease" },
    sidebar: { width: 220, minHeight: "100vh", background: dark ? "#111827" : "#1E1B4B", padding: "20px 0", display: "flex", flexDirection: "column", flexShrink: 0 },
    main: { flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" },
    topbar: { background: surface, borderBottom: `1px solid ${border}`, padding: "12px 24px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
    card: { background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 16, transition: "all 0.2s ease" },
    btn: (col = "#7C6FF7") => ({ background: col, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, transition: "opacity 0.2s" }),
    btnOutline: { background: "transparent", color: textMuted, border: `1px solid ${border}`, borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 500 },
    input: { background: dark ? "#0F172A" : "#F8FAFC", border: `1px solid ${border}`, borderRadius: 8, padding: "8px 12px", color: text, fontSize: 14, width: "100%", outline: "none" },
    badge: (col) => ({ background: col + "20", color: col, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600 }),
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
    modal: { background: surface, borderRadius: 16, padding: 28, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px rgba(0,0,0,0.3)" },
  };

  return (
    <div style={styles.app}>
      {/* Notification Toast */}
      {notification && (
        <div style={{ position: "fixed", top: 20, right: 20, background: "#7C6FF7", color: "#fff", padding: "12px 20px", borderRadius: 10, zIndex: 999, fontWeight: 600, fontSize: 14, boxShadow: "0 8px 24px rgba(124,111,247,0.4)", animation: "slideIn 0.3s ease" }}>
          {notification}
        </div>
      )}

      <div style={{ display: "flex" }}>
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <div style={{ padding: "0 20px 20px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>TaskFlow <span style={{ color: "#7C6FF7" }}>Pro</span></div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Intelligent Task Management</div>
          </div>

          <div style={{ padding: "16px 12px", flex: 1 }}>
            {[
              { id: "board", icon: "⊞", label: "Kanban Board" },
              { id: "list", icon: "≡", label: "List View" },
              { id: "calendar", icon: "◫", label: "Calendar" },
              { id: "analytics", icon: "◎", label: "Analytics" },
            ].map(v => (
              <button key={v.id} onClick={() => setView(v.id)} style={{ width: "100%", textAlign: "left", background: view === v.id ? "rgba(124,111,247,0.2)" : "transparent", color: view === v.id ? "#A78BFA" : "rgba(255,255,255,0.6)", border: view === v.id ? "1px solid rgba(124,111,247,0.3)" : "1px solid transparent", borderRadius: 8, padding: "10px 14px", cursor: "pointer", fontSize: 13, fontWeight: view === v.id ? 600 : 400, marginBottom: 4, display: "flex", alignItems: "center", gap: 10, transition: "all 0.2s" }}>
                <span style={{ fontSize: 16 }}>{v.icon}</span> {v.label}
              </button>
            ))}

            <div style={{ marginTop: 20, marginBottom: 8, fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", padding: "0 2px" }}>Industry</div>
            {Object.entries(INDUSTRIES).map(([key, ind]) => (
              <button key={key} onClick={() => setIndustry(key)} style={{ width: "100%", textAlign: "left", background: industry === key ? "rgba(255,255,255,0.08)" : "transparent", color: industry === key ? "#fff" : "rgba(255,255,255,0.5)", border: "1px solid transparent", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 12, fontWeight: industry === key ? 600 : 400, marginBottom: 2, display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s" }}>
                <span style={{ color: ind.color }}>{ind.icon}</span> {ind.label}
              </button>
            ))}
          </div>

          <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => setPomodoroActive(p => !p)} style={{ background: pomodoroActive ? "#EF444420" : "transparent", color: pomodoroActive ? "#EF4444" : "rgba(255,255,255,0.5)", border: `1px solid ${pomodoroActive ? "#EF4444" : "transparent"}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 12, textAlign: "left" }}>
              🍅 {pomodoroActive ? `${Math.floor(pomodoroSec / 60)}:${String(pomodoroSec % 60).padStart(2, "0")}` : "Pomodoro Focus"}
            </button>
            <button onClick={() => setShowMoodBar(m => !m)} style={{ background: "transparent", color: "rgba(255,255,255,0.5)", border: "1px solid transparent", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 12, textAlign: "left" }}>
              {MOODS[mood - 1]} Mood: {["Burnt", "Low", "Neutral", "Good", "Flowing"][mood - 1]}
            </button>
            {showMoodBar && (
              <div style={{ display: "flex", gap: 6, padding: "4px 0" }}>
                {MOODS.map((m, i) => (
                  <button key={i} onClick={() => { setMood(i + 1); setShowMoodBar(false); }} style={{ background: mood === i + 1 ? "rgba(255,255,255,0.15)" : "transparent", border: "1px solid transparent", borderRadius: 6, padding: "4px 6px", cursor: "pointer", fontSize: 16 }}>{m}</button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main style={styles.main}>
          {/* Top Bar */}
          <div style={styles.topbar}>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search tasks, tags..." style={{ ...styles.input, width: 220, height: 36 }} />

            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...styles.input, width: 120, height: 36 }}>
              <option value="all">All Types</option>
              <option value="priority">Priority</option>
              <option value="regular">Regular</option>
              <option value="custom">Custom</option>
            </select>

            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...styles.input, width: 120, height: 36 }}>
              <option value="all">All Status</option>
              <option value="todo">To Do</option>
              <option value="inprogress">In Progress</option>
              <option value="done">Done</option>
            </select>

            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ ...styles.input, width: 120, height: 36 }}>
              <option value="all">All Priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <div style={{ flex: 1 }} />

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 16, paddingRight: 16, borderRight: `1px solid ${border}` }}>
              {user?.photoURL && <img src={user.photoURL} alt="Avatar" style={{ width: 28, height: 28, borderRadius: "50%" }} />}
              <span style={{ fontSize: 13, fontWeight: 700, color: text }}>{user?.displayName?.split(" ")[0] || "User"}</span>
              <button onClick={onLogout} style={{ background: "transparent", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 14, marginLeft: 4 }} title="Sign Out">✕</button>
            </div>

            <button onClick={loadTemplate} style={{ ...styles.btnOutline, fontSize: 12 }}>Load {INDUSTRIES[industry].label} Template</button>
            <button onClick={() => setGoalModal(true)} style={{ ...styles.btnOutline, fontSize: 12 }}>Goals</button>
            <button onClick={startVoice} style={{ ...styles.btnOutline, fontSize: 12, color: voiceActive ? "#EF4444" : textMuted, borderColor: voiceActive ? "#EF4444" : border }}>🎤 Voice</button>
            <button onClick={() => setShowAI(true)} style={styles.btn("#7C6FF7")}>✦ AI Assistant</button>
            <button onClick={() => { setEditTask(null); setShowModal(true); }} style={styles.btn("#22C55E")}>+ New Task</button>
            <button onClick={() => setTheme(t => t === "light" ? "dark" : "light")} style={styles.btnOutline}>{dark ? "☀" : "☽"}</button>
          </div>

          {/* Stats bar */}
          <div style={{ display: "flex", gap: 1, background: dark ? "#0F172A" : "#F1F5F9", padding: "10px 24px", borderBottom: `1px solid ${border}` }}>
            {[
              { label: "Total", value: analytics.total, color: "#7C6FF7" },
              { label: "Done", value: analytics.done, color: "#22C55E" },
              { label: "Overdue", value: analytics.overdue, color: "#EF4444" },
              { label: "Time (min)", value: analytics.totalTime, color: "#F59E0B" },
              { label: "Score", value: analytics.productivityScore + "%", color: "#3B82F6" },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 20 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</span>
                <span style={{ fontSize: 11, color: textMuted, fontWeight: 600 }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* View Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
            {view === "board" && <KanbanView tasks={filteredTasks} styles={styles} border={border} textMuted={textMuted} dark={dark} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onEdit={t => { setEditTask(t); setShowModal(true); }} onDelete={deleteTask} onUpdate={updateTask} onPomodoro={(id) => { setPomodoroTask(id); setPomodoroActive(true); notify("Pomodoro started!"); }} onAIPriority={getAIPrioritySuggestion} />}
            {view === "list" && <ListView tasks={filteredTasks} styles={styles} border={border} textMuted={textMuted} dark={dark} onEdit={t => { setEditTask(t); setShowModal(true); }} onDelete={deleteTask} onUpdate={updateTask} onPomodoro={(id) => { setPomodoroTask(id); setPomodoroActive(true); notify("Pomodoro started!"); }} onAIPriority={getAIPrioritySuggestion} />}
            {view === "calendar" && <CalendarView tasks={filteredTasks} styles={styles} border={border} textMuted={textMuted} dark={dark} onEdit={t => { setEditTask(t); setShowModal(true); }} />}
            {view === "analytics" && <AnalyticsView analytics={analytics} tasks={tasks} styles={styles} border={border} textMuted={textMuted} dark={dark} />}
          </div>
        </main>
      </div>

      {/* Task Modal */}
      {showModal && (
        <TaskModal task={editTask} industry={industry} onClose={() => { setShowModal(false); setEditTask(null); }} onSave={(data) => { if (editTask?.id) { updateTask(editTask.id, data); notify("Task updated!"); } else { addTask(data); } setShowModal(false); setEditTask(null); }} styles={styles} border={border} textMuted={textMuted} dark={dark} />
      )}

      {/* AI Chat Modal */}
      {showAI && (
        <AIChatModal messages={aiMessages} input={aiInput} loading={aiLoading} onInput={setAiInput} onSend={sendAIMessage} onClose={() => setShowAI(false)} styles={styles} border={border} textMuted={textMuted} dark={dark} tasks={tasks} />
      )}

      {/* Goals Modal */}
      {goalModal && (
        <GoalsModal goals={goals} onClose={() => setGoalModal(false)} onUpdate={setGoals} styles={styles} border={border} textMuted={textMuted} dark={dark} />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #94A3B840; border-radius: 3px; }
        @keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

// ─── KANBAN VIEW ──────────────────────────────────────────────────────────────

function KanbanView({ tasks, styles, border, textMuted, dark, onDragStart, onDragOver, onDrop, onEdit, onDelete, onUpdate, onPomodoro, onAIPriority }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, minHeight: 400 }}>
      {KANBAN_COLS.map(col => {
        const colTasks = tasks.filter(t => t.status === col.id);
        return (
          <div key={col.id} onDragOver={onDragOver} onDrop={e => onDrop(e, col.id)} style={{ background: dark ? "#0F172A40" : "#F8FAFC", border: `1px solid ${border}`, borderRadius: 12, padding: 12, minHeight: 300 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: col.color }} />
                <span style={{ fontWeight: 700, fontSize: 13 }}>{col.label}</span>
              </div>
              <span style={{ background: col.color + "20", color: col.color, borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{colTasks.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {colTasks.map(t => (
                <TaskCard key={t.id} task={t} styles={styles} border={border} textMuted={textMuted} dark={dark} onDragStart={onDragStart} onEdit={onEdit} onDelete={onDelete} onUpdate={onUpdate} onPomodoro={onPomodoro} onAIPriority={onAIPriority} />
              ))}
              {colTasks.length === 0 && <div style={{ textAlign: "center", color: textMuted, fontSize: 12, padding: "20px 0", opacity: 0.5 }}>Drop tasks here</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── TASK CARD ────────────────────────────────────────────────────────────────

function TaskCard({ task, styles, border, textMuted, dark, onDragStart, onEdit, onDelete, onUpdate, onPomodoro, onAIPriority }) {
  const [expanded, setExpanded] = useState(false);
  const days = daysUntil(task.deadline);

  return (
    <div draggable onDragStart={e => onDragStart(e, task.id)} style={{ background: dark ? "#1E293B" : "#fff", border: `1px solid ${border}`, borderLeft: `3px solid ${PRIORITY_COLORS[task.priority]}`, borderRadius: 10, padding: 14, cursor: "grab", animation: "fadeUp 0.2s ease", transition: "box-shadow 0.2s" }} onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)"} onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={styles.badge(CATEGORY_COLORS[task.category])}>{task.category}</span>
            <span style={styles.badge(PRIORITY_COLORS[task.priority])}>{task.priority}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, textDecoration: task.status === "done" ? "line-through" : "none", opacity: task.status === "done" ? 0.6 : 1 }}>{task.title}</div>
        </div>
        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          <button onClick={() => onEdit(task)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 13, opacity: 0.5, padding: 2 }} title="Edit">✎</button>
          <button onClick={() => onDelete(task.id)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 13, opacity: 0.5, padding: 2, color: "#EF4444" }} title="Delete">✕</button>
        </div>
      </div>

      {task.deadline && (
        <div style={{ fontSize: 11, color: days !== null && days < 0 ? "#EF4444" : days !== null && days <= 1 ? "#F59E0B" : textMuted, marginBottom: 6 }}>
          📅 {formatDate(task.deadline)} {days !== null && (days < 0 ? "· overdue" : days === 0 ? "· today" : days === 1 ? "· tomorrow" : `· ${days}d`)}
        </div>
      )}

      {task.tags?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {task.tags.map(tag => <span key={tag} style={{ background: dark ? "#ffffff10" : "#F1F5F9", color: textMuted, borderRadius: 4, padding: "1px 6px", fontSize: 10 }}>#{tag}</span>)}
        </div>
      )}

      {task.subtasks?.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: textMuted, marginBottom: 4 }}>{task.subtasks.filter(s => s.done).length}/{task.subtasks.length} subtasks</div>
          <div style={{ background: dark ? "#ffffff10" : "#F1F5F9", borderRadius: 4, height: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "#22C55E", width: `${task.subtasks.length > 0 ? (task.subtasks.filter(s => s.done).length / task.subtasks.length) * 100 : 0}%`, transition: "width 0.3s" }} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {task.timeSpent > 0 && <span style={{ fontSize: 10, color: textMuted }}>⏱ {task.timeSpent}m</span>}
          {task.pomodoros > 0 && <span style={{ fontSize: 10, color: textMuted }}>🍅 {task.pomodoros}</span>}
          {task.recurrence !== "none" && task.recurrence && <span style={{ fontSize: 10, color: "#7C6FF7" }}>↻ {task.recurrence}</span>}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => onAIPriority(task)} style={{ background: "transparent", border: `1px solid ${border}`, borderRadius: 6, padding: "2px 6px", cursor: "pointer", fontSize: 10, color: "#7C6FF7" }} title="AI Priority">✦</button>
          <button onClick={() => onPomodoro(task.id)} style={{ background: "transparent", border: `1px solid ${border}`, borderRadius: 6, padding: "2px 6px", cursor: "pointer", fontSize: 10 }} title="Start Pomodoro">🍅</button>
          <select value={task.status} onChange={e => onUpdate(task.id, { status: e.target.value })} style={{ background: "transparent", border: `1px solid ${border}`, borderRadius: 6, padding: "2px 4px", cursor: "pointer", fontSize: 10, color: textMuted }}>
            <option value="todo">Todo</option>
            <option value="inprogress">In Progress</option>
            <option value="done">Done</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ─── LIST VIEW ────────────────────────────────────────────────────────────────

function ListView({ tasks, styles, border, textMuted, dark, onEdit, onDelete, onUpdate, onPomodoro, onAIPriority }) {
  const sorted = [...tasks].sort((a, b) => {
    const po = { high: 0, medium: 1, low: 2 };
    return po[a.priority] - po[b.priority];
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 100px 100px 80px", gap: 8, padding: "8px 12px", fontSize: 11, fontWeight: 700, color: textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
        <span>Task</span><span>Priority</span><span>Status</span><span>Deadline</span><span>Time</span><span>Actions</span>
      </div>
      {sorted.map(task => {
        const days = daysUntil(task.deadline);
        return (
          <div key={task.id} style={{ background: dark ? "#1E293B" : "#fff", border: `1px solid ${border}`, borderRadius: 10, padding: "12px 12px", display: "grid", gridTemplateColumns: "1fr 100px 100px 100px 100px 80px", gap: 8, alignItems: "center", transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.borderColor = "#7C6FF7"} onMouseLeave={e => e.currentTarget.style.borderColor = border}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, textDecoration: task.status === "done" ? "line-through" : "none", opacity: task.status === "done" ? 0.6 : 1 }}>{task.title}</div>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                <span style={styles.badge(CATEGORY_COLORS[task.category])}>{task.category}</span>
                {task.tags?.slice(0, 2).map(tag => <span key={tag} style={{ background: dark ? "#ffffff10" : "#F1F5F9", color: textMuted, borderRadius: 4, padding: "1px 6px", fontSize: 10 }}>#{tag}</span>)}
              </div>
            </div>
            <span style={styles.badge(PRIORITY_COLORS[task.priority])}>{task.priority}</span>
            <select value={task.status} onChange={e => onUpdate(task.id, { status: e.target.value })} style={{ background: "transparent", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 6px", cursor: "pointer", fontSize: 11, color: textMuted }}>
              <option value="todo">Todo</option>
              <option value="inprogress">In Progress</option>
              <option value="done">Done</option>
            </select>
            <span style={{ fontSize: 12, color: days !== null && days < 0 ? "#EF4444" : textMuted }}>{task.deadline ? formatDate(task.deadline) : "—"}</span>
            <span style={{ fontSize: 12, color: textMuted }}>{task.timeSpent || 0}m {task.pomodoros ? `/ ${task.pomodoros}🍅` : ""}</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => onAIPriority(task)} title="AI Priority" style={{ background: "#7C6FF720", color: "#7C6FF7", border: "none", borderRadius: 6, padding: "4px 6px", cursor: "pointer", fontSize: 11 }}>✦</button>
              <button onClick={() => onEdit(task)} style={{ background: "transparent", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 6px", cursor: "pointer", fontSize: 11 }}>✎</button>
              <button onClick={() => onDelete(task.id)} style={{ background: "transparent", border: `1px solid ${border}`, borderRadius: 6, padding: "4px 6px", cursor: "pointer", fontSize: 11, color: "#EF4444" }}>✕</button>
            </div>
          </div>
        );
      })}
      {tasks.length === 0 && <div style={{ textAlign: "center", padding: 60, color: textMuted, opacity: 0.5 }}>No tasks found. Create one!</div>}
    </div>
  );
}

// ─── CALENDAR VIEW ────────────────────────────────────────────────────────────

function CalendarView({ tasks, styles, border, textMuted, dark, onEdit }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const startDay = month.getDay();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const day = i - startDay + 1;
    if (day < 1 || day > daysInMonth) return null;
    return day;
  });

  const tasksByDay = {};
  tasks.forEach(t => {
    if (!t.deadline) return;
    const d = new Date(t.deadline + "T00:00:00");
    if (d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()) {
      const key = d.getDate();
      if (!tasksByDay[key]) tasksByDay[key] = [];
      tasksByDay[key].push(t);
    }
  });

  const todayDate = new Date();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} style={styles.btnOutline}>←</button>
        <span style={{ fontSize: 18, fontWeight: 700, minWidth: 180, textAlign: "center" }}>
          {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} style={styles.btnOutline}>→</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: border, border: `1px solid ${border}`, borderRadius: 12, overflow: "hidden" }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} style={{ background: dark ? "#1E293B" : "#F8FAFC", padding: "8px", textAlign: "center", fontSize: 11, fontWeight: 700, color: textMuted }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          const isToday = day && todayDate.getDate() === day && todayDate.getMonth() === month.getMonth() && todayDate.getFullYear() === month.getFullYear();
          const dayTasks = day ? (tasksByDay[day] || []) : [];
          return (
            <div key={i} style={{ background: dark ? "#1E293B" : "#fff", minHeight: 80, padding: 6, opacity: day ? 1 : 0.3 }}>
              {day && (
                <>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: isToday ? "#7C6FF7" : "transparent", color: isToday ? "#fff" : undefined, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: isToday ? 700 : 400, marginBottom: 4 }}>{day}</div>
                  {dayTasks.slice(0, 3).map(t => (
                    <div key={t.id} onClick={() => onEdit(t)} style={{ background: PRIORITY_COLORS[t.priority] + "20", color: PRIORITY_COLORS[t.priority], borderRadius: 4, padding: "2px 5px", fontSize: 10, fontWeight: 600, marginBottom: 2, cursor: "pointer", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      {t.title}
                    </div>
                  ))}
                  {dayTasks.length > 3 && <div style={{ fontSize: 10, color: textMuted }}>+{dayTasks.length - 3} more</div>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ANALYTICS VIEW ───────────────────────────────────────────────────────────

function AnalyticsView({ analytics, tasks, styles, border, textMuted, dark }) {
  const completionByDay = useMemo(() => {
    const days = {};
    tasks.filter(t => t.completedAt).forEach(t => {
      const d = new Date(t.completedAt).toLocaleDateString("en-US", { weekday: "short" });
      days[d] = (days[d] || 0) + 1;
    });
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => ({ day: d, count: days[d] || 0 }));
  }, [tasks]);

  const maxCount = Math.max(...completionByDay.map(d => d.count), 1);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
      {/* Score Card */}
      <div style={{ ...styles.card, gridColumn: "1 / -1", display: "flex", gap: 20, flexWrap: "wrap" }}>
        {[
          { label: "Productivity Score", value: analytics.productivityScore + "%", color: "#7C6FF7", sub: "Tasks completed" },
          { label: "Tasks Completed", value: analytics.done, color: "#22C55E", sub: `of ${analytics.total} total` },
          { label: "Overdue Tasks", value: analytics.overdue, color: "#EF4444", sub: "Need attention" },
          { label: "Total Time Logged", value: analytics.totalTime + "m", color: "#F59E0B", sub: "Across all tasks" },
        ].map(s => (
          <div key={s.label} style={{ flex: "1 1 140px", background: s.color + "10", border: `1px solid ${s.color}30`, borderRadius: 10, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Completion by Day */}
      <div style={styles.card}>
        <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 14 }}>Completions by Day</div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 120 }}>
          {completionByDay.map(d => (
            <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: "100%", background: "#7C6FF7", borderRadius: "4px 4px 0 0", height: `${(d.count / maxCount) * 80}px`, minHeight: d.count > 0 ? 4 : 0, transition: "height 0.3s" }} />
              <span style={{ fontSize: 10, color: textMuted }}>{d.day}</span>
              {d.count > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#7C6FF7" }}>{d.count}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Priority Distribution */}
      <div style={styles.card}>
        <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 14 }}>Priority Distribution</div>
        {Object.entries(analytics.byPriority).map(([p, count]) => (
          <div key={p} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>{p}</span>
              <span style={{ fontSize: 12, color: textMuted }}>{count} tasks</span>
            </div>
            <div style={{ background: dark ? "#ffffff10" : "#F1F5F9", borderRadius: 4, height: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", background: PRIORITY_COLORS[p], width: `${analytics.total > 0 ? (count / analytics.total) * 100 : 0}%`, transition: "width 0.5s ease", borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Category Breakdown */}
      <div style={styles.card}>
        <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 14 }}>Category Breakdown</div>
        {Object.entries(analytics.byCat).map(([cat, count]) => (
          <div key={cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: CATEGORY_COLORS[cat] }} />
              <span style={{ fontSize: 13, textTransform: "capitalize" }}>{cat}</span>
            </div>
            <span style={styles.badge(CATEGORY_COLORS[cat])}>{count}</span>
          </div>
        ))}
      </div>

      {/* Recent activity */}
      <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
        <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 14 }}>Recent Completions</div>
        {tasks.filter(t => t.completedAt).sort((a, b) => b.completedAt - a.completedAt).slice(0, 5).map(t => (
          <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
              <span style={{ fontSize: 13 }}>{t.title}</span>
            </div>
            <span style={{ fontSize: 11, color: textMuted }}>{new Date(t.completedAt).toLocaleDateString()}</span>
          </div>
        ))}
        {tasks.filter(t => t.completedAt).length === 0 && <div style={{ color: textMuted, fontSize: 13 }}>No completed tasks yet.</div>}
      </div>
    </div>
  );
}

// ─── TASK MODAL ───────────────────────────────────────────────────────────────

function TaskModal({ task, industry, onClose, onSave, styles, border, textMuted, dark }) {
  const [form, setForm] = useState({
    title: task?.title || "",
    desc: task?.desc || "",
    category: task?.category || "custom",
    priority: task?.priority || "medium",
    deadline: task?.deadline || "",
    tags: task?.tags?.join(", ") || "",
    industry: task?.industry || industry,
    recurrence: task?.recurrence || "none",
    subtasks: task?.subtasks || [],
    status: task?.status || "todo",
  });
  const [newSub, setNewSub] = useState("");

  function handleSave() {
    if (!form.title.trim()) return;
    onSave({
      ...form,
      tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
    });
  }

  return (
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{task?.id ? "Edit Task" : "New Task"}</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 20, color: textMuted }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: textMuted, display: "block", marginBottom: 4 }}>TITLE *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title..." style={{ ...styles.input, fontSize: 15 }} autoFocus />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: textMuted, display: "block", marginBottom: 4 }}>DESCRIPTION</label>
            <textarea value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="Add details..." rows={3} style={{ ...styles.input, resize: "vertical" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: textMuted, display: "block", marginBottom: 4 }}>CATEGORY</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={styles.input}>
                <option value="priority">Priority</option>
                <option value="regular">Regular</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: textMuted, display: "block", marginBottom: 4 }}>PRIORITY</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={styles.input}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: textMuted, display: "block", marginBottom: 4 }}>STATUS</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={styles.input}>
                <option value="todo">To Do</option>
                <option value="inprogress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: textMuted, display: "block", marginBottom: 4 }}>DEADLINE</label>
              <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} style={styles.input} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: textMuted, display: "block", marginBottom: 4 }}>RECURRENCE</label>
              <select value={form.recurrence} onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))} style={styles.input}>
                <option value="none">None</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: textMuted, display: "block", marginBottom: 4 }}>TAGS (comma separated)</label>
            <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="finance, review, urgent..." style={styles.input} />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: textMuted, display: "block", marginBottom: 4 }}>INDUSTRY</label>
            <select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} style={styles.input}>
              {Object.entries(INDUSTRIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
          </div>

          {/* Subtasks */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: textMuted, display: "block", marginBottom: 4 }}>SUBTASKS</label>
            {form.subtasks.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <input type="checkbox" checked={s.done} onChange={e => setForm(f => ({ ...f, subtasks: f.subtasks.map((st, j) => j === i ? { ...st, done: e.target.checked } : st) }))} />
                <span style={{ flex: 1, fontSize: 13, textDecoration: s.done ? "line-through" : "none", opacity: s.done ? 0.5 : 1 }}>{s.title}</span>
                <button onClick={() => setForm(f => ({ ...f, subtasks: f.subtasks.filter((_, j) => j !== i) }))} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#EF4444", fontSize: 14 }}>✕</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <input value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newSub.trim()) { setForm(f => ({ ...f, subtasks: [...f.subtasks, { id: generateId(), title: newSub.trim(), done: false }] })); setNewSub(""); } }} placeholder="Add subtask..." style={{ ...styles.input, flex: 1 }} />
              <button onClick={() => { if (newSub.trim()) { setForm(f => ({ ...f, subtasks: [...f.subtasks, { id: generateId(), title: newSub.trim(), done: false }] })); setNewSub(""); } }} style={styles.btn("#7C6FF7")}>Add</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button onClick={handleSave} style={{ ...styles.btn("#7C6FF7"), flex: 1, justifyContent: "center", padding: "12px" }}>{task?.id ? "Save Changes" : "Create Task"}</button>
            <button onClick={onClose} style={{ ...styles.btnOutline, flex: 1, justifyContent: "center", padding: "12px" }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AI CHAT MODAL ────────────────────────────────────────────────────────────

function AIChatModal({ messages, input, loading, onInput, onSend, onClose, styles, border, textMuted, dark, tasks }) {
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const suggestions = [
    "What should I work on next?",
    "Help me prioritize my tasks",
    "Suggest a productive schedule for today",
    "Analyze my productivity patterns",
  ];

  return (
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...styles.modal, maxWidth: 500, display: "flex", flexDirection: "column", height: "80vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>✦ AI Assistant</h2>
            <div style={{ fontSize: 11, color: textMuted }}>Powered by Claude • {tasks.length} tasks in context</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 20, color: textMuted }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
          {messages.length === 0 && (
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 13, color: textMuted, marginBottom: 12, textAlign: "center" }}>Ask me anything about your tasks or productivity</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {suggestions.map(s => (
                  <button key={s} onClick={() => { onInput(s); setTimeout(onSend, 50); }} style={{ background: dark ? "#ffffff08" : "#F8FAFC", border: `1px solid ${border}`, borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 12, textAlign: "left", color: textMuted }}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "85%", background: m.role === "user" ? "#7C6FF7" : (dark ? "#1E293B" : "#F8FAFC"), color: m.role === "user" ? "#fff" : undefined, border: m.role === "assistant" ? `1px solid ${border}` : "none", borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px", padding: "10px 14px", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ background: dark ? "#1E293B" : "#F8FAFC", border: `1px solid ${border}`, borderRadius: "12px 12px 12px 2px", padding: "12px 16px", fontSize: 13, color: textMuted }}>
                <span style={{ display: "inline-flex", gap: 4 }}>
                  {[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#7C6FF7", animation: `bounce 1s ease ${i * 0.2}s infinite`, display: "inline-block" }} />)}
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input value={input} onChange={e => onInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && onSend()} placeholder="Ask about your tasks..." style={{ ...styles.input, flex: 1 }} />
          <button onClick={onSend} disabled={loading} style={{ ...styles.btn("#7C6FF7"), opacity: loading ? 0.6 : 1 }}>Send</button>
        </div>
      </div>
      <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)} }`}</style>
    </div>
  );
}

// ─── GOALS MODAL ──────────────────────────────────────────────────────────────

function GoalsModal({ goals, onClose, onUpdate, styles, border, textMuted, dark }) {
  const [newGoal, setNewGoal] = useState({ title: "", type: "short", progress: 0 });

  function addGoal() {
    if (!newGoal.title.trim()) return;
    onUpdate(g => [...g, { id: generateId(), ...newGoal }]);
    setNewGoal({ title: "", type: "short", progress: 0 });
  }

  return (
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...styles.modal, maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Goal Tracker</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 20, color: textMuted }}>✕</button>
        </div>

        {goals.map(g => (
          <div key={g.id} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{g.title}</span>
                <span style={{ ...styles.badge(g.type === "long" ? "#7C6FF7" : "#22C55E"), marginLeft: 8 }}>{g.type}-term</span>
              </div>
              <span style={{ fontWeight: 700, color: "#7C6FF7" }}>{g.progress}%</span>
            </div>
            <div style={{ background: dark ? "#ffffff10" : "#F1F5F9", borderRadius: 6, height: 10, overflow: "hidden" }}>
              <div style={{ height: "100%", background: g.type === "long" ? "#7C6FF7" : "#22C55E", width: `${g.progress}%`, transition: "width 0.5s", borderRadius: 6 }} />
            </div>
            <input type="range" min="0" max="100" value={g.progress} onChange={e => onUpdate(gs => gs.map(x => x.id === g.id ? { ...x, progress: +e.target.value } : x))} style={{ width: "100%", marginTop: 6 }} />
          </div>
        ))}

        <div style={{ borderTop: `1px solid ${border}`, paddingTop: 16, marginTop: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: textMuted }}>ADD GOAL</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={newGoal.title} onChange={e => setNewGoal(g => ({ ...g, title: e.target.value }))} placeholder="Goal title..." style={styles.input} />
            <div style={{ display: "flex", gap: 8 }}>
              <select value={newGoal.type} onChange={e => setNewGoal(g => ({ ...g, type: e.target.value }))} style={{ ...styles.input, flex: 1 }}>
                <option value="short">Short-term</option>
                <option value="long">Long-term</option>
              </select>
              <button onClick={addGoal} style={styles.btn("#7C6FF7")}>Add Goal</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LOGIN & AUTH WRAPPER ─────────────────────────────────────────────────────

function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
      setError("Login failed. Please check your Firebase rules and configuration.");
    }
    setLoading(false);
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0F172A", color: "#F8FAFC", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ padding: 40, background: "#1E293B", borderRadius: 20, textAlign: "center", maxWidth: 400, width: "100%", boxShadow: "0 25px 50px rgba(0,0,0,0.5)", border: "1px solid #334155" }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.5px" }}>TaskFlow <span style={{ color: "#7C6FF7" }}>Pro</span></h1>
        <p style={{ color: "#94A3B8", marginBottom: 32 }}>Secure your productivity.</p>
        
        {error && <div style={{ color: "#EF4444", background: "#EF444420", padding: "10px", borderRadius: 8, marginBottom: 20, fontSize: 13, border: "1px solid #EF444450" }}>{error}</div>}
        
        <button onClick={handleLogin} disabled={loading} style={{ background: "#7C6FF7", color: "#fff", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 16, fontWeight: 700, width: "100%", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "background 0.2s" }} onMouseEnter={e => e.target.style.background = "#6B5CED"} onMouseLeave={e => e.target.style.background = "#7C6FF7"}>
          {loading ? "Connecting..." : "Continue with Google"}
        </button>
      </div>
      <div style={{ marginTop: 20, fontSize: 12, color: "#64748B" }}>Powered by Firebase Authentication</div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If auth is not initialized properly (e.g. missing keys), gracefully fail
    if (!auth || !auth.app.options.apiKey) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <div style={{ height: "100vh", background: "#0F172A", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>Loading Secure Session...</div>;

  return user ? <Dashboard user={user} onLogout={() => signOut(auth)} /> : <LoginScreen />;
}
