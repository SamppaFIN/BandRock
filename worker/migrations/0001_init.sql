-- Keikkailmoitukset. status: 'visible' näkyy sivulla, 'hidden' on piilotettu.
CREATE TABLE IF NOT EXISTS gigs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,            -- millisekuntia (Date.now())
  date       TEXT    NOT NULL,            -- VVVV-KK-PP
  time       TEXT,                        -- TT:MM, vapaaehtoinen
  artist     TEXT    NOT NULL,
  venue      TEXT    NOT NULL,
  city       TEXT    NOT NULL,
  url        TEXT,                        -- info- tai lippulinkki, vain https
  embed      TEXT,                        -- valmis soittimen osoite (YouTube/Spotify/SoundCloud), rakennettu palvelimella
  note       TEXT,
  status     TEXT    NOT NULL DEFAULT 'visible'
);

CREATE INDEX IF NOT EXISTS gigs_status_date ON gigs (status, date);
CREATE INDEX IF NOT EXISTS gigs_created ON gigs (created_at);
