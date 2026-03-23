async function runHunterFollowUps({ pool, sendWhatsAppText }) {

  const leads = await pool.query(`
    SELECT * FROM hunter_leads
    WHERE next_follow_up_at <= now()
    AND status IN ('CONTACTED','RESPONDED')
    LIMIT 20
  `);

  for (let l of leads.rows) {

    let msg = null;

    if (l.follow_up_step === 0) {
      msg = "Solo te escribo para confirmar si lo viste.";
    } else if (l.follow_up_step === 1) {
      msg = "Si quieres, te lo dejo listo hoy mismo.";
    }

    if (!msg) continue;

    try {
      await sendWhatsAppText({ to: l.phone, text: msg });
    } catch (e) {
      console.error("FU error:", e.message);
      continue;
    }

    await pool.query(`
      UPDATE hunter_leads
      SET follow_up_step = follow_up_step + 1,
          next_follow_up_at = now() + interval '2 days',
          last_contact_at = now()
      WHERE id = $1
    `, [l.id]);
  }
}

module.exports = { runHunterFollowUps };
