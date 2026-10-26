import { useEffect, useRef } from 'react';

/**
 * Custom hook for modal accessibility:
 * - Listens for 'Escape' key to close modal
 * - Traps keyboard focus inside the modal dialog
 * - Auto-focuses the first focusable element (or modal container) upon open
 * - Restores focus to previous active element upon close
 */
export function useModalA11y(isOpen, onClose) {
  const modalRef = useRef(null);
  const previousActiveElementRef = useRef(null);
  const onCloseRef = useRef(onClose);

  // Keep latest onClose callback without triggering effects
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;

    // Save previous active element before opening modal
    previousActiveElementRef.current = document.activeElement;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof onCloseRef.current === 'function') {
          onCloseRef.current();
        }
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Initial focus on open: focus first interactive form field without stealing focus if user is already typing
    const timer = setTimeout(() => {
      if (modalRef.current) {
        // Do not steal focus if an element inside the modal is already focused
        if (modalRef.current.contains(document.activeElement)) {
          return;
        }

        // Prefer first form input/select/textarea over the header close button
        const firstInput = modalRef.current.querySelector(
          'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'
        );
        if (firstInput) {
          firstInput.focus();
        } else {
          const firstFocusable = modalRef.current.querySelector(
            'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (firstFocusable) {
            firstFocusable.focus();
          } else if (typeof modalRef.current.focus === 'function') {
            modalRef.current.focus();
          }
        }
      }
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      if (
        previousActiveElementRef.current &&
        typeof previousActiveElementRef.current.focus === 'function'
      ) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen]);

  return modalRef;
}
