document.addEventListener('DOMContentLoaded', () => {
    // --- Tutorial Setup ---

    const tutorialSteps = [
        {
            element: '#mainTitle',
            title: 'Welcome!',
            text: 'This webpage is used for understanding the Keep Coral Gables Beautiful (KCGB) program. Let\'s take a quick tour of how to use the interactive map application.',
            position: 'bottom'
        },
        {
            element: '#viewDiv',
            title: 'Map',
            text: 'This map contains the locations of all events and programs from the KCGB program.',
            position: 'bottom'
        },
        {
            element: '.esri-search__container',
            title: 'Search Bar',
            text: 'Use this search bar to find specific addresses or places on the map.',
            position: 'bottom'
        },
        {
            element: '.esri-zoom',
            title: 'Zoom Controls',
            text: 'Use these controls to zoom in and out of the map.',
            position: 'bottom'
        },
        {
            element: '#viewDiv',
            title: 'Event/Program Pop-up',
            text: 'When you click on a map icon, a pop-up will appear with more information about the event or program. Try clicking on any icon now.',
            position: 'right'
        },
        {
            element: '#sidebar',
            title: 'Events/Programs Sidebar',
            text: 'Here you can find the Events and Programs sidebar, which explains the icons from the map.',
            position: 'right'
        },
        {
            element: '#sidebar',
            title: 'Events/Programs Sidebar',
            text: 'You can access the specific event/program buttons by clicking on the appropriate button for each category. Try hovering over each button.',
            position: 'right'
        },
        {
            element: '#infoPopupOverlay',
            title: 'Event/Program Information',
            text: 'When a button is clicked, an informational window appears with more details. Here "Battery Recycling" has been clicked as an example.',
            position: 'left'
        },
        {
            element: '#programsSidebar',
            title: 'Upcoming Events',
            text: 'Use this sidebar to access information about upcoming events.',
            position: 'left'
        },
        {
            element: '#navbar',
            title: 'Navigation Bar',
            text: 'Use this navigation bar to access different websites relevant to this site.',
            position: 'bottom'
        },
        {
            title: 'You\'re all set to go!',
            text: 'Thanks for using the KCGB Interactive Map. Have fun!',
            position: 'left'
        }
    ];

    let currentStep = 0;
    let previousStep = -1;
    let modalObserver = null;
    let highlightedElement = null; // Global flags for tutorial state
    window.isTutorialActive = false;
    window.currentTutorialStep = -1;

    const overlay = document.getElementById('tutorial-overlay');
    const tutorialBox = document.getElementById('tutorial-box');
    const titleEl = tutorialBox.querySelector('h3');
    const textEl = tutorialBox.querySelector('p');
    const prevBtn = document.getElementById('tutorial-prev');
    const nextBtn = document.getElementById('tutorial-next');
    const viewDiv = document.getElementById('viewDiv');
    const sidebar = document.getElementById('sidebar');

    /**
     * Helper function to prevent all clicks outside of the tutorial box.
     * It captures the click event and stops it from propagating.
     * @param {MouseEvent} e The click event.
     */
    function preventAllClicksOutsideTutorial(e) {
        if (!e.target.closest('#tutorial-box')) {
            e.stopPropagation();
            e.preventDefault();
        }
    }

    function startTutorial() {
        // If the custom map popup is open, close it before starting.
        const customPopup = document.getElementById('custom-popup');
        if (customPopup) {
            customPopup.style.display = 'none';
        }

        // If the infopopup is open, close it before starting.
        const infoPopupDialog = document.getElementById('infoPopupDialog');
        if (infoPopupDialog) {
            const buttonToClick2 = document.querySelector('#infoPopupClose');
            if (buttonToClick2) {
                buttonToClick2.click();
            }
        }

        currentStep = 0;
        previousStep = -1;
        overlay.style.display = 'block';
        window.isTutorialActive = true; // Tutorial is now active
        window.currentTutorialStep = 0; // Set initial step
        document.body.classList.add('tutorial-active'); // Add class to body
        tutorialBox.style.display = 'block';
        showStep(currentStep);

        // Close any accordion that might have been opened by the tutorial.
        if (typeof closeAllAccordions === 'function') {
            closeAllAccordions();
        }
    }

    function endTutorial() {
        overlay.style.display = 'none';
        tutorialBox.style.display = 'none';
        if (highlightedElement) {
            highlightedElement.classList.remove('tutorial-highlight');
            highlightedElement.style.pointerEvents = ''; // Reset any inline pointer-events style
            highlightedElement = null;
        }
        // Reset pointer events on the overlay
        overlay.style.pointerEvents = '';
        tutorialBox.style.pointerEvents = '';
        // Disconnect observer if tutorial is closed.
        if (modalObserver) {
            modalObserver.disconnect();
            modalObserver = null;
        }
        // Close any accordion that might have been opened by the tutorial.
        if (typeof closeAllAccordions === 'function') {
            closeAllAccordions();
        }
        // Also ensure the info popup is closed when the tutorial ends.
        const infoPopupDialog = document.getElementById('infoPopupDialog');
        if (infoPopupDialog && infoPopupDialog.style.display !== 'none') {
            const closeButton = document.getElementById('infoPopupClose');
            if (closeButton) closeButton.click();
        }
        viewDiv.classList.remove('tutorial-highlight2');
        // Clean up the click prevention listener when the tutorial ends.
        document.removeEventListener('click', preventAllClicksOutsideTutorial, { capture: true });
        window.isTutorialActive = false; // Tutorial is no longer active
        window.currentTutorialStep = -1; // Reset step
        document.body.classList.remove('tutorial-active'); // Remove class from body
    }

    function showStep(stepIndex) {
        // Reset pointer events at the start of each step.
        const customPopup = document.getElementById('custom-popup');
        if (customPopup) {
            customPopup.style.display = 'none';
        }

        overlay.style.pointerEvents = '';
        tutorialBox.style.pointerEvents = '';

        // Clean up special class from previous step
        document.body.classList.remove('tutorial-map-click-active');

        // Reset infoPopupOverlay z-index if it was modified in the previous step (step 7, index 8)
        const infoPopupOverlay = document.getElementById('infoPopupOverlay');
        if (infoPopupOverlay && previousStep === 7) {
            infoPopupOverlay.style.zIndex = '10000'; // Reset to its default z-index
        }

        // Update global step tracker
        window.currentTutorialStep = stepIndex;

        // Always ensure the info popup is closed unless we are specifically on step 8 (index 7).
        // This handles cases where the user might have opened it manually on other steps.
        const infoPopupDialog = document.getElementById('infoPopupDialog');
        if (infoPopupDialog && infoPopupDialog.style.display !== 'none' && stepIndex !== 7) {
            const closeButton = document.getElementById('infoPopupClose');
            if (closeButton) closeButton.click();
        }

        // Clean up the global click prevention from the previous step.
        document.removeEventListener('click', preventAllClicksOutsideTutorial, { capture: true });

        // Disconnect any observer from a previous interactive step.
        if (modalObserver) {
            modalObserver.disconnect();
            modalObserver = null;
        }

        if (stepIndex < 0 || stepIndex >= tutorialSteps.length) {
            endTutorial();
            return;
        }

        // Update navigation buttons
        prevBtn.style.display = stepIndex === 0 ? 'none' : 'inline-block';
        nextBtn.style.display = stepIndex === tutorialSteps.length - 1 ? 'none' : 'inline-block';

        const step = tutorialSteps[stepIndex];

        // Remove previous highlight
        if (highlightedElement) {
            highlightedElement.classList.remove('tutorial-highlight');
            highlightedElement.style.pointerEvents = ''; // Reset any inline pointer-events style
        }

        // Update text
        titleEl.textContent = step.title;
        textEl.textContent = step.text;

        // Highlight new element
        if (step.dynamicElement) {
            highlightedElement = step.dynamicElement();
        } else {
            highlightedElement = document.querySelector(step.element);
        }

        if (highlightedElement) {
            highlightedElement.classList.add('tutorial-highlight');

            // Position the tutorial box, accounting for the highlighted element and viewport constraints.
            positionAndConstrainTutorialBox(highlightedElement, step.position);
        } else {
            // If there's no element to highlight, center the box.
            positionAndConstrainTutorialBox(null);
        }

        // Adds map to highlighted elements for steps 2-8
        if (stepIndex >= 1 && stepIndex <= 7) {
            viewDiv.classList.add('tutorial-highlight2');
        }

        // Removes map from highlighted elements for steps outside 2-8
        if (stepIndex < 1 || stepIndex > 7) {
            viewDiv.classList.remove('tutorial-highlight2');
        }

        // For steps 1,2,3,8,10 the highlighted element is interactive but shouldn't be.
        // We disable pointer events on it directly. This prevents both hover and click.
        if (stepIndex === 0 || stepIndex === 1 || stepIndex === 2 || stepIndex === 3 || stepIndex === 8 || stepIndex === 10) {
            if (highlightedElement) {
                highlightedElement.style.pointerEvents = 'none';
            }
        }

        // Special handling for step 5 (index 4) to allow map clicks.
        if (stepIndex === 4) {
            // Allow clicks to pass through the overlay to the map.
            overlay.style.pointerEvents = 'none';
            // But ensure the tutorial box itself remains interactive.
            tutorialBox.style.pointerEvents = 'auto';
            // Add a specific class to the body for this step
            document.body.classList.add('tutorial-map-click-active');
        }

        // Special handling for steps 6-7 to allow hover but not click.
        if (stepIndex == 5 || stepIndex == 6) {
            // Allow hover events to pass through the overlay for the map highlight effect.
            overlay.style.pointerEvents = 'none';
            // But keep the tutorial box itself clickable.
            tutorialBox.style.pointerEvents = 'auto';
 
            // Add a global listener to prevent all clicks outside the tutorial box.
            document.addEventListener('click', preventAllClicksOutsideTutorial, { capture: true });
        }

        // Special handling for step 8 (index 7): OPEN the info popup when entering.
        if (stepIndex === 7) {
            const buttonToClick = document.querySelector('button[data-layer-name="BATTERY_RECYCLING"]');
            if (!buttonToClick) {
                console.warn("Tutorial: BATTERY_RECYCLING button not found for step 8.");
                return;
            }

            let observer = null; // To store the MutationObserver instance

            // Set up the MutationObserver
            observer = new MutationObserver((mutations, obs) => {
                const infoPopupOverlay = document.getElementById('infoPopupOverlay');
                const infoPopupDialog = document.getElementById('infoPopupDialog');

                // Temporarily increase the z-index of infoPopupOverlay to be above tutorial-overlay
                if (infoPopupOverlay) infoPopupOverlay.style.zIndex = '20003';

                // Check if both overlay and dialog exist, and the overlay is visible.
                // The dialog itself doesn't have a display style, its parent overlay does.
                if (infoPopupOverlay && infoPopupDialog && infoPopupOverlay.style.display !== 'none') {
                    // The popup is now available and visible.
                    highlightedElement = infoPopupDialog; // Highlight the dialog itself
                    highlightedElement.classList.add('tutorial-highlight2');
                    positionAndConstrainTutorialBox(highlightedElement, step.position);

                    obs.disconnect(); // Stop observing once found
                    observer = null; // Clear reference
                }
            });

            // Observe the body for attribute changes (specifically 'style') on any descendant.
            // This will catch when infoPopupOverlay's display style changes from 'none' to 'flex'.
            observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style'] });

            // Also observe for childList changes, in case the overlay is created for the first time.
            observer.observe(document.body, { childList: true, subtree: true });

            // Fallback: disconnect observer after a timeout if it doesn't find the element.
            // This prevents the observer from running indefinitely if something goes wrong.
            setTimeout(() => {
                if (observer) {
                    observer.disconnect();
                    observer = null;
                    console.warn("Tutorial: infoPopupDialog did not appear or become visible within timeout for highlighting.");
                }
            }, 3000); // Give it a bit more time

            // Now, trigger the click that will create the popup.
            buttonToClick.click();

            // Since we are handling the highlight asynchronously, we return here to prevent
            // the default synchronous highlighting logic from running and failing.
            return;
        }

        // Special handling for steps 7-10 to OPEN the accordion.
        if (stepIndex >= 6 && stepIndex <= 9) {
            // The function toggleCollapse is in main.js and is global.
            // To ensure it's open, we check first.
            const sidebarContent = document.querySelector('#sidebar .sidebar-content');
            if (sidebarContent) {
                const headers = sidebarContent.querySelectorAll('.collapsible-header');
                for (const header of headers) {
                    // Correctly target the 'Ongoing programs' section
                    if (header.firstChild.textContent.trim() === 'Ongoing programs') {
                        const content = header.nextElementSibling;
                        // Open it if it's not already open
                        if (!content.classList.contains('open') && typeof toggleCollapse === 'function') {
                            toggleCollapse(header);
                        }
                        break; // Found it
                    }
                }
            }
        }

        // Close accordion when leaving steps 7-10
        if ((previousStep >= 6 && previousStep <= 9) && (stepIndex < 6 || stepIndex > 9)) {
            if (typeof closeAllAccordions === 'function') {
                closeAllAccordions();
            }
        }
        console.log(`Tutorial: Showing step ${stepIndex + 1} of ${tutorialSteps.length}`);
    }

    /**
     * Positions the tutorial box next to a target element, ensuring it stays within the viewport.
     * @param {HTMLElement} targetElement The element to position the box near.
     * @param {string} positionHint A hint for placement ('top', 'bottom', 'left', 'right').
     */
    function positionAndConstrainTutorialBox(targetElement, positionHint = 'right') {
        if (!targetElement) {
            // If no element, center the box (useful for the first step).
            tutorialBox.style.top = '50%';
            tutorialBox.style.left = '50%';
            tutorialBox.style.transform = 'translate(-50%, -50%)';
            return;
        }

        tutorialBox.style.transform = 'none'; // Reset transform if it was centered
        const targetRect = targetElement.getBoundingClientRect();
        const boxWidth = tutorialBox.offsetWidth;
        const boxHeight = tutorialBox.offsetHeight;
        const margin = 15; // Gap between element and box

        let top, left;

        // Calculate ideal position based on hint
        switch (positionHint) {
            case 'top': top = targetRect.top - boxHeight - margin; left = targetRect.left + (targetRect.width / 2) - (boxWidth / 2); break;
            case 'bottom': top = targetRect.bottom + margin; left = targetRect.left + (targetRect.width / 2) - (boxWidth / 2); break;
            case 'left': top = targetRect.top + (targetRect.height / 2) - (boxHeight / 2); left = targetRect.left - boxWidth - margin; break;
            case 'right': default: top = targetRect.top + (targetRect.height / 2) - (boxHeight / 2); left = targetRect.right + margin; break;
        }

        // Viewport collision correction
        const { innerWidth, innerHeight } = window;
        if (left + boxWidth > innerWidth - margin) left = innerWidth - boxWidth - margin;
        if (left < margin) left = margin;
        if (top + boxHeight > innerHeight - margin) top = innerHeight - margin - boxHeight;
        if (top < margin) top = margin;

        tutorialBox.style.top = `${top}px`;
        tutorialBox.style.left = `${left}px`;
    }

    // --- Event Listeners ---
    document.getElementById('start-tutorial-btn').addEventListener('click', startTutorial);
    document.getElementById('tutorial-close').addEventListener('click', endTutorial);
    prevBtn.addEventListener('click', () => {
        previousStep = currentStep;
        currentStep--;
        showStep(currentStep);
    });
    nextBtn.addEventListener('click', () => {
        previousStep = currentStep;
        currentStep++;
        showStep(currentStep);
    });
});