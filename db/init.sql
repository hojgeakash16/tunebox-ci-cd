CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tracks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  genre TEXT NOT NULL,
  release_year INT NOT NULL,
  duration_sec INT NOT NULL,
  bpm INT NOT NULL,
  plays INT NOT NULL DEFAULT 0,
  color_a TEXT NOT NULL,
  color_b TEXT NOT NULL
);

CREATE TABLE favorites (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id INT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id)
);

CREATE INDEX idx_tracks_genre ON tracks(genre);

-- All artists, albums and tracks are fictional demo content.
INSERT INTO tracks (title, artist, album, genre, release_year, duration_sec, bpm, plays, color_a, color_b) VALUES
('Midnight Drive', 'Aria Vale', 'Neon Streets', 'Synthwave', 2024, 215, 118, 120450, '#7b2ff7', '#f107a3'),
('Chrome Hearts', 'Aria Vale', 'Neon Streets', 'Synthwave', 2024, 198, 124, 98200, '#ff0080', '#7928ca'),
('Monsoon Raga', 'Dev Anand Trio', 'Rain Notes', 'Indian Fusion', 2023, 262, 92, 150300, '#11998e', '#38ef7d'),
('Chai & Tabla', 'Dev Anand Trio', 'Rain Notes', 'Indian Fusion', 2023, 241, 104, 87100, '#f7971e', '#ffd200'),
('Lofi Study Room', 'Quiet Pines', 'Late Library', 'Lo-fi', 2025, 168, 78, 310900, '#232526', '#414345'),
('Coffee Steam', 'Quiet Pines', 'Late Library', 'Lo-fi', 2025, 152, 82, 201400, '#614385', '#516395'),
('Stadium Lights', 'The Voltage', 'Loud Season', 'Rock', 2022, 232, 138, 175600, '#b92b27', '#1565c0'),
('Rust & Thunder', 'The Voltage', 'Loud Season', 'Rock', 2022, 254, 146, 142800, '#8e0e00', '#1f1c18'),
('Blue Hour', 'Mira Solano', 'Soft Landing', 'Pop', 2025, 189, 110, 402100, '#4776e6', '#8e54e9'),
('Sugar Rush', 'Mira Solano', 'Soft Landing', 'Pop', 2025, 176, 128, 388700, '#ff758c', '#ff7eb3'),
('Paper Planes', 'Kite Season', 'Open Fields', 'Indie', 2023, 205, 100, 64200, '#36d1dc', '#5b86e5'),
('Golden Porch', 'Kite Season', 'Open Fields', 'Indie', 2023, 221, 96, 71900, '#f2994a', '#f2c94c'),
('Bassline Bazaar', 'DJ Kaveri', 'Floor Fillers', 'Electronic', 2024, 247, 126, 220300, '#00c6ff', '#0072ff'),
('Afterglow', 'DJ Kaveri', 'Floor Fillers', 'Electronic', 2024, 228, 122, 190500, '#ee0979', '#ff6a00'),
('Velvet Smoke', 'Nina Okoye', 'Blue Notes', 'Jazz', 2021, 283, 88, 45300, '#0f2027', '#2c5364'),
('Sunday Brunch', 'Nina Okoye', 'Blue Notes', 'Jazz', 2021, 214, 94, 52800, '#c79081', '#dfa579');
