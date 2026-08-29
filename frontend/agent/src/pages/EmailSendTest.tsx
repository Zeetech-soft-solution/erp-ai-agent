import { useState } from "react";

export function EmailSendTest() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="tab-page">
      <div className="tab-page-header">
        <h2>Email Send (test)</h2>
      </div>

      <form className="compose-form">
        <input type="text" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <textarea placeholder="Body" value={body} onChange={(e) => setBody(e.target.value)} />
        <button type="submit" className="action-btn" disabled>
          Send test email
        </button>
      </form>
    </div>
  );
}
