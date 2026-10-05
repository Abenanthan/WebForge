<?php
declare(strict_types=1);

namespace WebForge\Experiments;

final class ArraysExperiment extends Experiment
{
    public function slug(): string { return 'php-arrays'; }
    public function title(): string { return 'Arrays'; }
    public function description(): string
    {
        return 'Indexed and associative arrays, plus the functions you use most: explode, count, sort, array_map, array_filter, in_array, implode.';
    }

    public function inputs(): array
    {
        return [
            'items'  => ['label' => 'Comma-separated items', 'type' => 'text', 'default' => 'mango, apple, banana, kiwi, cherry', 'rules' => ['required', 'string', 'max:200']],
            'search' => ['label' => 'Search for', 'type' => 'text', 'default' => 'kiwi', 'rules' => ['string', 'max:30']],
        ];
    }

    public function run(array $in, Steps $show): mixed
    {
        $items = array_values(array_filter(array_map('trim', explode(',', $in['items']))));
        $show->add('$items = array_map("trim", explode(",", $input))', $items);
        $show->add('count($items)', count($items));
        $show->add('$items[0]', $items[0] ?? null, 'first element (index 0)');

        $sorted = $items;
        sort($sorted);
        $show->add('sort($sorted)', $sorted, 'sort() changes the array in place');

        $upper = array_map('strtoupper', $items);
        $show->add('array_map("strtoupper", $items)', $upper);

        $long = array_values(array_filter($items, fn($item) => strlen($item) > 4));
        $show->add('array_filter($items, fn($i) => strlen($i) > 4)', $long);

        $search = $in['search'] ?? '';
        $show->add("in_array('{$search}', \$items)", in_array($search, $items, true));

        $lengths = [];
        foreach ($items as $item) {
            $lengths[$item] = strlen($item);
        }
        $show->add('$lengths[$item] = strlen($item)  // associative', $lengths);
        $show->add('array_keys($lengths)', array_keys($lengths));

        echo 'Sorted: ' . implode(', ', $sorted) . "\n";
        echo 'Longer than 4 letters: ' . implode(', ', $long) . "\n";
        return ['sorted' => $sorted, 'lengths' => $lengths];
    }
}
