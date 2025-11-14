// --- ArcGIS API Setup ---
require([
    "esri/layers/FeatureLayer",
    "esri/layers/support/FeatureEffect",
    "esri/widgets/Legend",
    "esri/views/MapView",
    "esri/WebMap",
    "esri/widgets/Search",
    // "esri/widgets/BasemapToggle" // Import the BasemapToggle widget
], function(FeatureLayer, FeatureEffect, Legend, MapView, WebMap, Search) {
    const webmap = new WebMap({
        portalItem: { id: "7fbf8e0cc8504422ac0aadebcd324100" },
        basemap: "streets-vector"
    });
 
    // Define center and scale for different screen sizes
    const desktopCenter = [-80.35, 25.684506729852785];
    const desktopScale = 130000;
    // On mobile, the sidebar takes up the bottom, so we shift the map center up (increase latitude)
    const mobileCenter = [-80.27, 25.65];
    const mobileScale = 110000;

    // Check initial screen size
    const isMobile = window.matchMedia("(max-width: 950px), (orientation: portrait)").matches;

    const view = new MapView({
        container: "viewDiv",
        map: webmap,
        center: isMobile ? mobileCenter : desktopCenter,
        scale: isMobile ? mobileScale : desktopScale
    });
 
    // Make the view accessible to global helper functions
    window.mapView = view;

    // Add Widgets
    view.ui.add(new Search({ view: view }), "top-right");

    let highlightHandle = null;
    let lastLayerInfo = null;
    let activeLayer = null;
    let activeInfoButton = null; // Track which button opened the info popup
    // cancellation token for async highlight requests. Each new request
    // increments this; earlier async operations check the current value and
    // abort if they've been superseded.
    let currentHighlightRequest = 0;

    // --- Responsive Map Center ---
    // Handles adjusting the map's center and scale for mobile devices.
    const mediaQuery = window.matchMedia("(max-width: 950px), (orientation: portrait)");

    function handleScreenChange(e) {
        if (e.matches) {
            // Screen is 950px or less
            view.goTo({ center: mobileCenter, scale: mobileScale });
        } else {
            // Screen is wider than 950px
            view.goTo({ center: desktopCenter, scale: desktopScale });
        }
    }

    // Add a listener for changes in screen size
    mediaQuery.addEventListener('change', handleScreenChange);

    // Wait for the view to be ready before adding event listeners that depend on it
    view.when(async() => {
        // Disable the default ArcGIS popup
        populateUpcomingEvents();

        view.popup.autoOpenEnabled = false;
        view.on("click", handleMapClick);

        // Ensure all feature layers in the map return all their fields on queries/hittests.
        // This is crucial for the custom popup to get the necessary attributes.
        webmap.layers.forEach(layer => {
            if (layer.type === "feature") {
                layer.outFields = ["*"];
            }
        });

        // Get the sidebar element once
        async function highlightFeatureByName(name) {
            // A local id to detect if this async request becomes stale.
            const requestId = ++currentHighlightRequest;

            // Clear old highlight
            if (highlightHandle) {
                highlightHandle.remove();
                highlightHandle = null;
            }

            // Restore last moved layer to original position
            if (lastLayerInfo) {
                webmap.reorder(lastLayerInfo.layer, lastLayerInfo.originalIndex);
                lastLayerInfo = null;
            }

            // Find layer by title
            const layer = webmap.layers.find(l => l.title === name);
            if (!layer) {
                console.warn("Layer not found:", name);
                return;
            }

            // Bring this layer to the top
            const originalIndex = webmap.layers.indexOf(layer);
            const topIndex = webmap.layers.length - 1;
            if (originalIndex !== topIndex) {
                webmap.reorder(layer, topIndex);
                lastLayerInfo = { layer, originalIndex };
                console.log(`Moved ${name} to top`);
            }

            // Wait for layerView and highlight. Between awaits another hover
            // might have started; check the cancellation token and abort if
            // this request is stale.
            const layerView = await view.whenLayerView(layer);
            if (requestId !== currentHighlightRequest) {
                // restore moved layer if this request was cancelled
                if (lastLayerInfo) {
                    webmap.reorder(lastLayerInfo.layer, lastLayerInfo.originalIndex);
                    lastLayerInfo = null;
                }
                return;
            }

            const results = await layer.queryFeatures();
            if (requestId !== currentHighlightRequest) {
                if (lastLayerInfo) {
                    webmap.reorder(lastLayerInfo.layer, lastLayerInfo.originalIndex);
                    lastLayerInfo = null;
                }
                return;
            }

            if (results.features.length > 0) {
                highlightHandle = layerView.highlight(results.features);
            }
        }

        function clearAllHighlights() {
            if (highlightHandle) {
                highlightHandle.remove();
                highlightHandle = null;
            }

            if (lastLayerInfo) {
                webmap.reorder(lastLayerInfo.layer, lastLayerInfo.originalIndex);
                lastLayerInfo = null;
            }
        }

        // Find the standalone table containing layer descriptions once on load.
        const descriptionsTable = webmap.tables.find(t => t.title === "Layer Descriptions");
        if (!descriptionsTable) {
            console.error("Could not find the 'Layer Descriptions' standalone table. Popups will show default content.");
        }

        function toggleLayerVisibility(name) {
            const layer = webmap.layers.find(l => l.title === name);
            if (!layer) return;

            if (activeLayer === layer) {
                // If clicking the same active layer → show all layers again
                webmap.layers.forEach(l => l.visible = true);
                activeLayer = null;
                console.log(`Restored all layers`);
            } else {
                // Hide all others
                webmap.layers.forEach(l => l.visible = (l === layer));
                activeLayer = layer;
                console.log(`Showing only layer: ${name}`);
            }
        }

        document.querySelectorAll("button[data-layer-name]").forEach(button => {
            const layerName = button.dataset.layerName;

            button.addEventListener("mouseenter", () => {
                highlightFeatureByName(layerName);
            });

            button.addEventListener("mouseleave", () => {
                // Cancel any pending async highlight request so a stale
                // request can't re-apply a highlight after the mouse has left.
                currentHighlightRequest++;
                clearAllHighlights();
            });

            button.addEventListener("click", async (e) => {
                // If the same button is clicked again, close the popup and reset.
                if (activeInfoButton === button) {
                    closeInfoPopup();
                    // The layer visibility is already handled by toggleLayerVisibility
                    toggleLayerVisibility(layerName);
                    return;
                }

                // Primary behavior: toggle layer visibility
                toggleLayerVisibility(layerName);

                const publicTransportLayers = ["CG_Trolley", "CG_Buses", "CG_MetroRail"];
                const showLocations = !publicTransportLayers.includes(layerName);

                // Secondary: show a popup with button-specific info.
                let title = button.innerText;
                const programLayers = ["BATTERY_RECYCLING", "CLPR", "LITTER_KIT", "NEXTREX"];
                if (programLayers.includes(layerName)) {
                    // Re-assign the existing 'title' variable, don't declare a new one with 'const'
                    title += " Program";
                }
                // Show popup immediately with a loading state.
                let html = `
                    <h3>About</h3>
                    <p>Loading description...</p>
                    ${showLocations ? `
                        <h3 class="locations-header">Locations</h3>
                        <div class="locations-list-container">
                            <p>Loading locations...</p>
                        </div>
                    ` : ''}
                `;
                activeInfoButton = button;
                showInfoPopup({ title, html });

                // --- Fetch Content Asynchronously ---
                let descriptionHtml = '<p>No description available.</p>';
                let locationsHtml = ''; // Default to empty string

                // 1. Fetch the "About" description from the standalone table.
                if (descriptionsTable) {
                    try {
                        const query = { where: `LAYER_NAME = '${layerName}'`, outFields: ["Description"], returnGeometry: false };
                        const results = await descriptionsTable.queryFeatures(query);
                        if (results.features.length > 0) {
                            descriptionHtml = results.features[0].attributes.Description;
                        }
                    } catch (err) {
                        console.error("Failed to query descriptions table:", err);
                        descriptionHtml = '<p>Error loading description.</p>';
                    }
                }

                // 2. Fetch the locations from the feature layer.
                if (showLocations) {
                    const layer = webmap.layers.find(l => l.title === layerName);
                    if (layer) {
                        try {
                            const { features } = await layer.queryFeatures({ where: "1=1", outFields: ["*"] });
                            if (features.length > 0) {
                                const getAttrByAlias = (feature, alias) => {
                                    const attrs = feature.attributes;
                                    // First, try to find the field by its alias.
                                    let field = feature.layer.fields.find(f => f.alias === alias);
                                    // If no field is found by alias, fall back to finding it by name.
                                    if (!field) field = feature.layer.fields.find(f => f.name === alias);
                                    // For CLPR specifically, the alias is "Location" but the field name is "Name".
                                    if (layer.title === "CLPR" && alias === "Location") field = feature.layer.fields.find(f => f.name === "Name");
                                    return field && attrs[field.name] ? attrs[field.name] : null;
                                };

                                const locationItems = features.map(feature => {
                                    const location = getAttrByAlias(feature, "Location") || 'N/A';
                                    const address = getAttrByAlias(feature, "Address") || 'N/A';
                                    return `<li>${location} | <i>${address}</i></li>`;
                                }).join('');

                                locationsHtml = `<ul class="locations-list">${locationItems}</ul>`;
                            } else {
                                locationsHtml = '<p>No locations found for this category.</p>';
                            }
                        } catch (err) {
                            console.error("Failed to query layer for locations:", err);
                            locationsHtml = '<p>Error loading locations.</p>';
                        }
                    }
                }

                // 3. Update the popup content with the fetched data.
                const finalHtml = `
                    <h3>About</h3>
                    ${descriptionHtml}
                    ${showLocations ? `
                        <h3 class="locations-header">Locations</h3>
                        <div class="locations-list-container">${locationsHtml}</div>
                    ` : ''}
                `;

                const contentEl = document.getElementById('infoPopupContent');
                if (contentEl) contentEl.innerHTML = finalHtml;
            });
        });

        // Add a single global listener (not per-button). When the mouse
        // enters the body, increment the cancellation token to abort any
        // pending highlight and clear any active highlights / reorders.
        document.body.addEventListener("mouseenter", () => {
            currentHighlightRequest++;
            clearAllHighlights();
        });
        
        // --- Info popup helpers ---
        function ensureInfoPopup() {
            let overlay = document.getElementById('infoPopupOverlay');
            if (overlay) return overlay;

            overlay = document.createElement('div');
            overlay.id = 'infoPopupOverlay';
            Object.assign(overlay.style, {
                position: 'fixed',
                inset: '0',
                display: 'none',
                alignItems: 'center',
                justifyContent: 'center',
                // Keep clicks outside the window detectable but avoid a
                // full-screen opaque backdrop so the popup appears like a
                // floating window rather than a blocking modal.
                background: 'transparent',
                // Allow clicks to pass through the overlay so background
                // buttons remain clickable. The dialog will opt-in to
                // receive pointer events.
                pointerEvents: 'none',
                zIndex: 10000,
                boxSizing: 'border-box',
                left: '75vw', // Start at 75% from the left, where the right sidebar begins
                top: '55px', // Position directly below the navbar
                height: '94vh' // Match the height of the map view and right sidebar
            });

            const dialog = document.createElement('div');
            dialog.id = 'infoPopupDialog';
            Object.assign(dialog.style, {
                background: '#fff',
                borderRadius: '8px',
                // Small, window-like size by default. User can resize.
                width: '560px',
                maxWidth: '25vw',
                maxHeight: '94vh',
                overflow: 'auto',
                boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
                position: 'relative',
                padding: '0',
                border: '1px solid rgba(0,0,0,0.08)',
                resize: 'both'
            });
            // Ensure the dialog itself can receive pointer events even though
            // the overlay allows clicks to pass through.
            dialog.style.pointerEvents = 'auto';

            // Make the dialog a little more like a window: add a title bar
            const titleBar = document.createElement('div');
            titleBar.id = 'infoPopupTitleBar';
            Object.assign(titleBar.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: '#f3f4f6',
                borderTopLeftRadius: '8px',
                borderTopRightRadius: '8px',
                cursor: 'move',
                userSelect: 'none',
                borderBottom: '1px solid rgba(0,0,0,0.06)'
            });

            // Create the title, content and close button elements (previously
            // these were accidentally removed which prevented the popup from
            // being built/displayed)
            const titleEl = document.createElement('h2');
            titleEl.id = 'infoPopupTitle';
            titleEl.style.margin = '0';
            titleEl.style.fontSize = '1rem';
            titleEl.style.padding = '0';
            titleBar.appendChild(titleEl);

            const contentEl = document.createElement('div');
            contentEl.id = 'infoPopupContent';

            const closeBtn = document.createElement('button');
            closeBtn.id = 'infoPopupClose';
            closeBtn.innerText = '×';
            Object.assign(closeBtn.style, {
                border: 'none',
                background: 'transparent',
                cursor: 'pointer'
            });
            closeBtn.addEventListener('click', () => {
                // If an active button is tracked, simulate a click on it to ensure
                // consistent behavior (toggling layer visibility) with a manual second click.
                if (activeInfoButton) {
                    activeInfoButton.click();
                } else {
                    // Fallback if no button is active (e.g., if popup was opened programmatically)
                    closeInfoPopup();
                }
            });

            const titleControls = document.createElement('div');
            titleControls.style.display = 'flex';
            titleControls.style.gap = '8px';

            // Keep close button inside the title bar for a window-like UX
            Object.assign(closeBtn.style, {
                position: 'static',
                right: 'auto',
                top: 'auto',
                fontSize: '16px'
            });
            titleControls.appendChild(closeBtn);
            titleBar.appendChild(titleControls);

            // Content container below the title bar with padding
            const contentWrapper = document.createElement('div');
            contentWrapper.style.padding = '12px 16px 18px 16px';
            contentWrapper.appendChild(contentEl);

            // Assemble dialog and add to overlay
            dialog.appendChild(titleBar);
            dialog.appendChild(contentWrapper);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            // Draggable window behavior
            let isDragging = false;
            let dragOffset = { x: 0, y: 0 };

            titleBar.addEventListener('mousedown', (ev) => {
                isDragging = true;
                const rect = dialog.getBoundingClientRect();
                dragOffset.x = ev.clientX - rect.left;
                dragOffset.y = ev.clientY - rect.top;
                // temporarily disable transitions while dragging
                dialog.style.transition = 'none';
                ev.preventDefault();
            });

            document.addEventListener('mousemove', (ev) => {
                if (!isDragging) return;
                dialog.style.left = (ev.clientX - dragOffset.x) + 'px';
                dialog.style.top = (ev.clientY - dragOffset.y) + 'px';
                dialog.style.position = 'fixed';
            });

            document.addEventListener('mouseup', () => {
                if (!isDragging) return;
                isDragging = false;
                dialog.style.transition = '';
            });

            // Note: we intentionally do NOT close on overlay clicks because the
            // overlay is non-blocking (pointer-events: none) and clicks should
            // interact with the page beneath the window.

            // Escape key closes the popup
            document.addEventListener('keydown', function onEsc(e) {
                if (e.key === 'Escape') closeInfoPopup();
            });

            return overlay;
        }

        function showInfoPopup({ title = '', html = '' } = {}) {
            const overlay = ensureInfoPopup();
            const titleEl = overlay.querySelector('#infoPopupTitle');
            const contentEl = overlay.querySelector('#infoPopupContent');
            titleEl.textContent = title;
            contentEl.innerHTML = html;
            overlay.style.display = 'flex';
        }

        function closeInfoPopup() {
            const overlay = document.getElementById('infoPopupOverlay');
            if (overlay) {
                overlay.style.display = 'none';
                activeInfoButton = null; // Reset the active button tracker
            }
        }

        /**
         * Handles clicks on the map to show a custom popup.
         * @param {Object} event The map click event.
         */
        async function handleMapClick(event) {
            // If tutorial is active and not on the specific step for map interaction,
            // prevent the custom popup from appearing.
            if (window.isTutorialActive && window.currentTutorialStep !== 4) {
                return;
            }

            const customPopup = document.getElementById('custom-popup');
            // Hide popup initially
            customPopup.style.display = 'none';

            const { results } = await view.hitTest(event);
            const graphic = results.find(r => r.graphic && r.graphic.layer);

            if (!graphic) {
                return; // Exit if no feature was clicked
            }

            const feature = graphic.graphic;
            const layerTitle = feature.layer.title;
            const attrs = feature.attributes;

            // Do not show the custom popup for the city boundary layer.
            if (layerTitle === "CityBoundary2019" || !feature.layer.fields) {
                return;
            }

            // Find the corresponding button to get its text for the title
            const button = document.querySelector(`button[data-layer-name="${layerTitle}"]`);
            const title = button ? button.innerText : layerTitle;

            // Helper to get an attribute value by its alias, not its name.
            // This is more robust if the underlying field names change.
            const getAttrByAlias = (alias) => {
                const field = feature.layer.fields.find(f => f.alias === alias);
                return field ? attrs[field.name] : null;
            };

            let content = `<h3>${title}</h3>`;
            
            // Helper to create a content box if the attribute exists
            const createBox = (label, value) => {
                if (value) {
                    return `<div class="popup-info-box"><strong>${label}:</strong> ${value}</div>`;
                }
                return '';
            };

            // Only add "Location" box if the layer is not one of the specified public transportation layers
            if (layerTitle !== "CG_Trolley" && layerTitle !== "CG_Buses" && layerTitle !== "CG_MetroRail") {
                content += createBox("Location", getAttrByAlias("Location"));
            }
            content += createBox("Address", getAttrByAlias("Address"));
            content += createBox("Events at Location", getAttrByAlias("Events"));
            content += `<button class="popup-button">View More</button>`;

            customPopup.innerHTML = content;

            // Position and show the popup
            customPopup.style.left = `${event.x + 15}px`;
            customPopup.style.top = `${event.y - 15}px`;
            customPopup.style.display = 'block';

            // Stop the original map click from bubbling up and being caught by the listener we are about to add.
            // This is crucial to prevent the popup from immediately closing itself.
            event.stopPropagation();

            // Add a listener to the new "View More" button if needed
            const viewMoreBtn = customPopup.querySelector('.popup-button');
            if (viewMoreBtn) {
                viewMoreBtn.addEventListener('click', () => {
                    // If the corresponding sidebar button exists, click it. This will
                    // trigger the logic to open the main info popup.
                    // Also stop propagation for this click to prevent it from closing the custom popup.
                    event.stopPropagation();
                    if (button) {
                        const collapsibleContent = button.closest('.collapsible-content');

                        // If the button is in a closed accordion, open it first.
                        if (collapsibleContent && !collapsibleContent.classList.contains('open')) {
                            const header = collapsibleContent.previousElementSibling;
                            if (header && typeof toggleCollapse === 'function') { // Ensure toggleCollapse is defined
                                toggleCollapse(header);
                            }
                        }
                        // Simulate click on the sidebar button to open the main info popup
                        button.click();
                    }
                    customPopup.style.display = 'none'; // Hide this small popup.
                });
            }

            // Add a one-time listener to close the popup when clicking anywhere else
            const closePopupHandler = (e) => {
                // If the click target is inside the custom popup, do nothing (don't close it)
                // This allows interaction within the popup (e.g., clicking "View More")
                // Also, if the click is on the "View More" button, let its handler manage the closing.
                // The 'e.target.closest' check is more robust for nested elements.
                if (customPopup.contains(e.target) || e.target.closest('.popup-button')) {
                    return;
                }
                // During the tutorial, the popup should only remain open on step 5 (index 4).
                // In all other cases (normal use, other tutorial steps), it should close on an outside click.
                if (window.isTutorialActive && window.currentTutorialStep === 4) {
                    return;
                }
                customPopup.style.display = 'none';
            };

            // Use a timeout to prevent the current click from closing it immediately.
            // This ensures the listener is added to the event queue *after* the current click event has finished.
            setTimeout(() => {
                document.addEventListener('click', closePopupHandler, { capture: true, once: true });
            }, 0);
        }

    }).catch(error => console.error("MapView failed to load:", error));

    /**
     * Fetches event data from the kcgbEvents FeatureServer and populates the upcoming events sidebar.
     */
    async function populateUpcomingEvents() {
        const sidebar = document.getElementById('programsSidebar');

        if (!sidebar) {
            console.error("Upcoming events sidebar not found.");
            return;
        }

        try {
            // Explicitly wait for the webmap to load all its resources, including standalone tables.
            await webmap.load();

            // The events data is a standalone table in the webmap, not a layer.
            // We need to find it in the `webmap.tables` collection.
            const eventsTable = webmap.tables.find(table => table.title === "kcgbEvents");

            if (!eventsTable) {
                console.warn("The 'kcgbEvents' table could not be found in the webmap. Available tables:", webmap.tables.map(t => t.title));
                return;
            }

            // Wait for the table to be fully loaded before querying.
            await eventsTable.load();

            // Verify that the table has the proper methods for querying.
            if (typeof eventsTable.queryFeatures !== 'function') {
                throw new Error("The 'kcgbEvents' table does not have queryFeatures method. Table type: " + eventsTable.type);
            }

            const query = {
                where: "1=1", // Get all events
                outFields: ["*"], // Fetch all fields to avoid field name mismatch errors
                returnGeometry: false
            };

            let queryResult;
            try {
                queryResult = await eventsTable.queryFeatures(query);
            } catch (queryError) {
                console.error("Query error details:", {
                    message: queryError.message,
                    name: queryError.name,
                    details: queryError.details,
                    fullError: queryError
                });
                throw queryError;
            }

            // Gracefully handle cases where the query result is null or features are missing
            if (!queryResult || !queryResult.features) {
                console.warn("Query to kcgbEvents returned no features or an invalid result.");
                return;
            }
            
            const { features } = queryResult;
            
            // Log available fields from the first feature to debug field names
            if (features.length > 0) {
                console.log("Available fields in kcgbEvents table:", Object.keys(features[0].attributes));
            }

            const eventHtml = features.map(feature => {
                const attrs = feature.attributes;
                // Use flexible field name detection
                const eventName = attrs.EventName || attrs.event_name || attrs.Name || 'Event';
                const eventDate = attrs.EventDate || attrs.event_date || attrs.Date;
                const eventLocation = attrs.EventLocation || attrs.event_location || attrs.Location || 'N/A';
                const eventDescription = attrs.Description || attrs.description || attrs.EventDescription || attrs.event_description || '';
                const eventLink = attrs.EventLink || attrs.event_link || attrs.Link;

                let formattedDate = 'N/A';
                let formattedTime = 'N/A';
                
                if (eventDate) {
                    try {
                        const date = new Date(eventDate);
                        formattedDate = date.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        });
                        // Extract time from the eventDate field using local timezone
                        formattedTime = date.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                    } catch (e) {
                        formattedDate = eventDate;
                    }
                }

                return `
                    <div class="event-item">
                        <h4>${eventName}</h4>
                        ${eventDescription ? `<p>${eventDescription}</p>` : ''}
                        <p><strong>Date:</strong> ${formattedDate}</p>
                        <p><strong>Time:</strong> ${formattedTime}</p>
                        <p><strong>Location:</strong> ${eventLocation}</p>
                        ${eventLink ? `<a href="${eventLink}" target="_blank" rel="noopener noreferrer" class="event-link">More Info</a>` : ''}
                    </div>
                `;
            }).join('');

            // Clear the sidebar and remove the template HTML ({{ programs_html|safe }})
            sidebar.innerHTML = '';

            // Create a new container for the upcoming events.
            const upcomingEventsContainer = document.createElement('div');
            upcomingEventsContainer.id = 'upcoming-events-container';

            // Add a title for the new section with the same styling as the sidebar header.
            const title = document.createElement('h1');
            title.classList.add('sidebar-header2');
            title.textContent = 'UPCOMING EVENTS';
            upcomingEventsContainer.appendChild(title);

            if (features.length === 0) {
                upcomingEventsContainer.innerHTML += '<p>No upcoming events found.</p>';
            } else {
                upcomingEventsContainer.innerHTML += eventHtml;
            }

            // Append the new container to the sidebar.
            sidebar.appendChild(upcomingEventsContainer);
            console.log(`Successfully populated ${features.length} upcoming events.`);

        } catch (error) {
            // Log the full error object to get more details, especially from server-side errors.
            console.error("Failed to fetch upcoming events:", error);
            // To avoid overwriting content on error, we can log it or append an error message.
            // For now, we'll just log it to keep the UI clean if the service fails.
        }
    }
    
    /**
     * Helper function to create a delay.
     * @param {number} ms Milliseconds to wait.
     * @returns {Promise<void>}
     */
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
});

// --- UI Interaction and Helper Functions ---

/**
 * Toggles the visibility of a collapsible content section.
 * @param {HTMLElement} header The header element that was clicked.
 */
function toggleCollapse(header) {
    const contentToToggle = header.nextElementSibling;
    const icon = header.querySelector('.toggle-icon');
    const isOpening = !contentToToggle.classList.contains('open');
    const currentlyOpen = document.querySelector('.collapsible-content.open');

    // If another accordion is open, close it first.
    if (currentlyOpen && currentlyOpen !== contentToToggle) {
        closeAccordion(currentlyOpen);
    }

    // Now, toggle the clicked accordion.
    if (isOpening) {
        contentToToggle.classList.add('open');
        contentToToggle.style.maxHeight = contentToToggle.scrollHeight + "px";
        if (icon) icon.style.transform = 'rotate(90deg)';
        updateSidebarHeight();
    } else {
        // When closing, we can update the height immediately.
        closeAccordion(contentToToggle);
        updateSidebarHeight();
    }
}

/**
 * Helper function to close a specific accordion content element.
 * @param {HTMLElement} contentElement The .collapsible-content element to close.
 */
function closeAccordion(contentElement) {
    contentElement.style.maxHeight = null;
    contentElement.classList.remove('open');
    const icon = contentElement.previousElementSibling.querySelector('.toggle-icon');
    if (icon) icon.style.transform = 'rotate(0deg)';
}

/**
 * Finds and closes all open accordion sections. This is typically called when switching tabs.
 */
function closeAllAccordions() {
    document.querySelectorAll('.collapsible-content.open').forEach(openContent => {
        closeAccordion(openContent);
    });
    // After closing all accordions, reset the sidebar height.
    updateSidebarHeight();
}

/**
 * Adjusts the sidebar height. If an accordion is open, it expands just enough
 * to show all accordion headers, capped at 87vh. The content inside the
 * open accordion will scroll if necessary. If all are closed, it shrinks.
 */
function updateSidebarHeight() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) {
        console.error("Sidebar element not found. Cannot update height.");
        return;
    }
 
    const header = sidebar.querySelector('.sidebar-header');
    const contentArea = sidebar.querySelector('.sidebar-content');
    if (!header || !contentArea) {
        console.error("Sidebar header or content area not found.");
        return;
    }

    const openContent = contentArea.querySelector('.collapsible-content.open');

    if (openContent) {
        // To synchronize animations, we manually calculate the final height instead of
        // relying on a transitioning parent's scrollHeight, which can be unreliable.
        let requiredHeight = 0;

        // 1. Height of the main sidebar header.
        requiredHeight += header.offsetHeight;

        // 2. Get vertical padding of the content area.
        const contentStyle = window.getComputedStyle(contentArea);
        requiredHeight += parseFloat(contentStyle.paddingTop) + parseFloat(contentStyle.paddingBottom);

        // 3. Add height of all accordion headers.
        // We iterate through the containers to include their margins in the calculation.
        contentArea.querySelectorAll('.collapsible-container').forEach(container => {
            const containerStyle = window.getComputedStyle(container);
            const header = container.querySelector('.collapsible-header');
            requiredHeight += header.offsetHeight + parseFloat(containerStyle.marginTop) + parseFloat(containerStyle.marginBottom);
        });

        // 4. Add the scroll height of the one open content section.
        requiredHeight += openContent.scrollHeight;
 
        // Add the 'expanded' class to apply any specific styles for the expanded state
        // and set the calculated height.
        sidebar.classList.add('expanded');
        sidebar.style.height = `${requiredHeight}px`;
    } else {
        // If no accordion is open, remove the 'expanded' class.
        sidebar.classList.remove('expanded');
        // Revert to the default collapsed height defined in the CSS.
        sidebar.style.height = null;
    }
}
     
// --- Main Event Listener ---
document.addEventListener('DOMContentLoaded', () => {
    // --- Mobile Navigation & Sidebar Toggles ---
    const navbarToggler = document.getElementById('navbar-toggler-btn');
    const navLinks = document.querySelector('.nav-links');

    if (navbarToggler && navLinks) {
        navbarToggler.addEventListener('click', () => {
            navLinks.classList.toggle('open');
        });
    }

    // Toggle for the Events & Programs sidebar
    const eventsSidebar = document.getElementById('sidebar');
    const eventsSidebarToggler = document.getElementById('toggle-events-sidebar');

    if (eventsSidebarToggler && eventsSidebar) {
        eventsSidebarToggler.addEventListener('click', () => {
            eventsSidebar.classList.toggle('open');
        });
    }

    // --- Help Modal Logic ---
    const helpModal = document.getElementById('helpModal');
    const helpBtn = document.getElementById('help-popup-btn');
    const helpModalCloseBtn = document.getElementById('helpModalClose');

    if (helpBtn && helpModal && helpModalCloseBtn) {
        helpBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent link from navigating
            helpModal.style.display = 'block';
        });

        helpModalCloseBtn.addEventListener('click', () => {
            helpModal.style.display = 'none';
        });

        // Also close when clicking outside the modal content
        window.addEventListener('click', (event) => {
            if (event.target === helpModal) {
                helpModal.style.display = 'none';
            }
        });
    }
});