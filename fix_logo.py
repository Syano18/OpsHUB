from PIL import Image

def fix_logo(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    width, height = img.size
    pixels = img.load()
    
    # Floodfill to remove outer background (including halo)
    visited = set()
    stack = [(0, 0), (width-1, 0), (0, height-1), (width-1, height-1)]
    
    # Aggressive threshold for outer background to eat the halo
    def is_bg(r, g, b, a):
        return r > 200 and g > 200 and b > 200
        
    while stack:
        x, y = stack.pop()
        if (x, y) in visited:
            continue
            
        visited.add((x, y))
        r, g, b, a = pixels[x, y]
        
        if is_bg(r, g, b, a):
            pixels[x, y] = (255, 255, 255, 0)
            
            if x + 1 < width: stack.append((x+1, y))
            if x - 1 >= 0: stack.append((x-1, y))
            if y + 1 < height: stack.append((x, y+1))
            if y - 1 >= 0: stack.append((x, y-1))

    # For the text area (bottom ~35% of the image), aggressively replace all light pixels.
    y_threshold = int(height * 0.65)
    for y in range(y_threshold, height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if is_bg(r, g, b, a):
                pixels[x, y] = (255, 255, 255, 0)

    img.save(output_path, "PNG")

if __name__ == '__main__':
    fix_logo("public/logo.png", "public/logo-transparent.png")
