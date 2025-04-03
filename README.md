# Awesome Wallpapers - Interactive Gallery

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)]

An interactive and visually appealing web application for browsing, searching, and downloading a curated collection of high-quality wallpapers. Built with Vue.js and Tailwind CSS, featuring a distinct neon teal aesthetic.

**Live Demo:** [https://alexandrosliaskos.github.io/Awesome_Wallpapers/](https://alexandrosliaskos.github.io/Awesome_Wallpapers/)

![Screenshot placeholder - consider adding desktop and mobile screenshots]

## Key Features

*   **Interactive UI:** Built with Vue 3 for a dynamic user experience.
*   **Responsive Design:** Optimized layout for both desktop (side panel + main preview) and mobile devices (grid view with expandable details).
*   **Advanced Search:**
    *   Search wallpapers by filename.
    *   Filter by tags using the `@` prefix (e.g., `@nord`, `@minimal`).
    *   Keyboard navigation (Up/Down arrows, Enter) for search results.
*   **Wallpaper Details:** Displays metadata for each wallpaper, including:
    *   Resolution (Width x Height)
    *   File Size (MB)
    *   File Type
    *   Associated Tags
*   **Multiple Views:**
    *   **Desktop:** Sorted list view with expandable details alongside a main preview grid.
    *   **Mobile:** Compact grid view with tappable items revealing details.
*   **Direct Downloads:** Provides direct links to the raw wallpaper files hosted on GitHub.
*   **Efficient Loading:** Utilizes lazy loading for preview images in the grid.
*   **Modern Aesthetics:** Features a dark theme with neon teal accents.
*   **Smooth Scrolling:** Ensures seamless navigation when selecting wallpapers.

## Technologies Used

*   **Frontend Framework:** [Vue.js 3](https://vuejs.org/) (Composition API)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/)
*   **Data:** JSON (`wallpapers_database.json`)

## How to Use

1.  **Browse:**
    *   **Desktop:** Scroll through the list panel on the left or the image grid on the right.
    *   **Mobile:** Scroll through the main image grid.
2.  **Search:** Use the search bar at the top.
    *   Enter text to search filenames.
    *   Enter `@tagname` (e.g., `@anime`, `@dark`) to filter by tags.
3.  **View Details:**
    *   **Desktop:** Click a wallpaper in the list or grid. Details expand in the list item, and the selection highlights in both views. The list scrolls to the selected item.
    *   **Mobile:** Tap a wallpaper in the grid. An info panel expands below the image. Tap again to collapse.
4.  **Download:** Click the "Download Wallpaper" button within the details panel to open/download the full-resolution image.

## Development

To run this project locally:

1.  Clone the repository:
    ```bash
    git clone https://github.com/AlexandrosLiaskos/Awesome_Wallpapers.git
    ```
2.  Navigate to the project directory:
    ```bash
    cd Awesome_Wallpapers
    ```
3.  Open `index.html` in your web browser. (No build step required for this simple setup).

*Note: Wallpapers are sourced directly from the `images` directory in the `main` branch via GitHub Raw URLs specified in `wallpapers_database.json`.*

## Contributing

Contributions are welcome! If you have wallpapers to add or improvements to suggest:

1.  Fork the repository.
2.  Add your wallpaper(s) to the `images/` directory (if applicable, otherwise just update JSON).
3.  Update `wallpapers_database.json` with the new wallpaper details (filename, tags, metadata, raw URL). Ensure metadata is accurate.
4.  Create a pull request with your changes.

Please ensure added wallpapers are of high quality and adhere to general community standards (no offensive content).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

Wallpapers featured in this gallery are curated from various online sources. Credit belongs to the original creators. This project serves as an interface for browsing this specific collection.
