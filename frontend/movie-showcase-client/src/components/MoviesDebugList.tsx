import type { Movie } from '../types/movie';

interface Props {
  title: string;
  movies: Movie[];
}

/**
 * Tiny debug view that lists the received movies so we can eyeball the
 * generation shape (title, actors, likes, reviews, etc.). Replace with the
 * real catalog UI later.
 */
export default function MoviesDebugList({ title, movies }: Props) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2>
        {title} <small style={{ opacity: 0.6 }}>({movies.length})</small>
      </h2>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {movies.map((movie) => (
          <MovieDebugRow key={movie.sequenceIndex} movie={movie} />
        ))}
      </ul>

      <details>
        <summary>Raw JSON</summary>
        <pre
          style={{
            background: '#1a1a1a',
            padding: '1rem',
            borderRadius: 8,
            overflow: 'auto',
            fontSize: 13,
          }}
        >
          {JSON.stringify(movies, null, 2)}
        </pre>
      </details>
    </section>
  );
}

function MovieDebugRow({ movie }: { movie: Movie }) {
  return (
    <li
      style={{
        border: '1px solid #333',
        borderRadius: 8,
        padding: '0.75rem 1rem',
        marginBottom: '0.5rem',
        background: '#181818',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
        <strong>#{movie.sequenceIndex} — {movie.title}</strong>
        <span style={{ opacity: 0.7 }}>
          {movie.year} · {movie.genre}
        </span>
      </div>
      <div style={{ opacity: 0.85, marginTop: 4 }}>
        Actors: {movie.actors.join(', ') || <em>none</em>}
      </div>
      <div style={{ opacity: 0.6, marginTop: 4, fontSize: 12 }}>
        Likes: {movie.likes} · Reviews: {movie.reviews.length}
        {movie.reviews.length > 0 && (
          <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
            {movie.reviews.map((review, i) => (
              <li key={i}>{review}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
