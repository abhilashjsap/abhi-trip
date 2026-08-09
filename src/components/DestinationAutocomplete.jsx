import { useState, useEffect, useRef, useCallback } from "react";
import { searchPlaces } from "../utils/geocoding";

const DEBOUNCE_MS = 400;

export default function DestinationAutocomplete({
  id,
  label,
  placeholder,
  value,
  onChange,
  disabled,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);
  const requestIdRef = useRef(0);

  const runSearch = useCallback(async (query) => {
    const thisRequestId = ++requestIdRef.current;
    setLoading(true);
    const results = await searchPlaces(query);
    // Ignore stale responses that resolve out of order.
    if (thisRequestId !== requestIdRef.current) return;
    setSuggestions(results);
    setLoading(false);
  }, []);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);
    setHighlightedIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = newValue.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
    debounceRef.current = setTimeout(() => runSearch(trimmed), DEBOUNCE_MS);
  };

  const handleSelect = (suggestion) => {
    onChange(suggestion.label);
    setSuggestions([]);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(
        (prev) => (prev - 1 + suggestions.length) % suggestions.length
      );
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  // Close the dropdown on outside click.
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="form-group autocomplete-wrap" ref={wrapperRef}>
      <label htmlFor={id}>{label}</label>
      <div className="autocomplete-input-wrap">
        <input
          id={id}
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
        />
        {loading && <span className="autocomplete-spinner" aria-hidden="true" />}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul className="autocomplete-dropdown" id={`${id}-listbox`} role="listbox">
          {suggestions.map((s, idx) => (
            <li
              key={`${s.label}-${idx}`}
              role="option"
              aria-selected={idx === highlightedIndex}
              className={
                "autocomplete-option" +
                (idx === highlightedIndex ? " highlighted" : "")
              }
              onMouseDown={() => handleSelect(s)}
              onMouseEnter={() => setHighlightedIndex(idx)}
            >
              <span className="autocomplete-pin" aria-hidden="true">📍</span>
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}