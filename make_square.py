from PIL import Image

def make_square(input_path, output_path, size):
    img = Image.open(input_path).convert("RGBA")
    width, height = img.size
    
    max_dim = max(width, height)
    
    square_img = Image.new('RGBA', (max_dim, max_dim), (255, 255, 255, 255))
    
    offset = ((max_dim - width) // 2, (max_dim - height) // 2)
    square_img.paste(img, offset)
    
    square_img = square_img.resize((size, size), Image.Resampling.LANCZOS)
    
    square_img.save(output_path, "PNG")

def make_ico(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    width, height = img.size
    max_dim = max(width, height)
    square_img = Image.new('RGBA', (max_dim, max_dim), (255, 255, 255, 255))
    offset = ((max_dim - width) // 2, (max_dim - height) // 2)
    square_img.paste(img, offset)
    square_img.save(output_path, format="ICO", sizes=[(256, 256), (128, 128), (64, 64), (32, 32), (16, 16)])

if __name__ == '__main__':
    make_square("public/logo.png", "public/pwa-192x192.png", 192)
    make_square("public/logo.png", "public/pwa-512x512.png", 512)
    make_ico("public/logo.png", "public/favicon.ico")
