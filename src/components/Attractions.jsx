import RegenerateButton from "./RegenerateButton";
import { buildMapsSearchUrl } from "../utils/geocoding";

export default function Attractions({ attractions, destination, onRegenerate, regenerating }) {
  if (!attractions?.length) return null;

  return (
    <section className="attractions">
      <div className="section-heading section-heading-with-action">
        <div>
          <span className="section-eyebrow">Where to go</span>
          <h2>Places worth your time</h2>
        </div>
        {onRegenerate && (
          <RegenerateButton onClick={onRegenerate} loading={regenerating} />
        )}
      </div>

      <div className="attractions-scroll">
        {attractions.map((place, idx) => (
          <article key={idx} className="attraction-card">
            <div className="attraction-image-wrap">
              {place.image ? (
                <img
                  src={place.image.url}
                  alt={place.image.alt || place.name}
                  loading="lazy"
                />
              ) : (
                <div className="attraction-image-placeholder" aria-hidden="true" />
              )}
              <span className="attraction-category">{place.category}</span>
            </div>

            <div className="attraction-body">
              <h3>{place.name}</h3>
              <p className="attraction-desc">{place.description}</p>

              {place.historicalSignificance && (
                <div className="attraction-history">
                  <span className="history-label">Historical significance</span>
                  <p>{place.historicalSignificance}</p>
                </div>
              )}

              {place.photoTip && (
                <p className="attraction-photo-tip">📷 {place.photoTip}</p>
              )}

              <div className="attraction-meta">
                {place.bestTimeToVisit && (
                  <span>{place.bestTimeToVisit}</span>
                )}
                {place.estimatedDuration && (
                  <span>{place.estimatedDuration}</span>
                )}
              </div>

              {destination && (
                <a
                  className="map-search-link"
                  href={buildMapsSearchUrl(place.name, destination)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Search nearby
                </a>
              )}

              {place.image?.credit && (
                <a
                  className="photo-credit"
                  href={place.image.credit.link}
                  target="_blank"
                  rel="noreferrer"
                >
                  Photo: {place.image.credit.name} / Unsplash
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
