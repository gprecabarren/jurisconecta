"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
type Notice = { id: string; category: string; title: string; body: string; href: string; read_at: string | null; created_at: string };
export function NoticeCenter() {
  const [items, setItems] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/notifications").then(async (response) => { if (!response.ok) throw new Error(); return await response.json() as { notifications: Notice[] }; }).then((data) => setItems(data.notifications)).catch(() => setError("No pudimos cargar los avisos.")); }, []);
  async function mark(id: string) {
    const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (response.ok) setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
  }
  return <section className="portal-panel account-form" id="avisos"><div className="panel-title"><div><p className="eyebrow">Centro de avisos</p><h2>Notificaciones</h2></div><span className="content-count">{items.filter((item) => !item.read_at).length} nuevas</span></div>{error && <p role="status">{error}</p>}{items.length === 0 && <p>Sin novedades por ahora.</p>}<div className="notice-center-list">{items.slice(0, 20).map((item) => <article className={item.read_at ? "notice-center-item" : "notice-center-item unread"} key={item.id}><div><b>{item.title}</b><p>{item.body}</p><small>{new Date(item.created_at + "Z").toLocaleString("es-CL")}</small></div><div>{item.href && <Link href={item.href}>Ver</Link>}{!item.read_at && <button onClick={() => void mark(item.id)}>Marcar leído</button>}</div></article>)}</div></section>;
}
