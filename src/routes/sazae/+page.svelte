<script lang="ts">
	import { __BROWSER__ } from 'svelte-petit-utils';
	import { relation, table } from '$lib';

	const Family = table<{
		name: string;
		father?: string;
		mother?: string;
	}>(
		(o) => o.name,
		[
			{ name: '波平' },
			{ name: '海平' },
			{ name: 'フネ' },
			{ name: 'ワカメ', father: '波平', mother: 'フネ' },
			{ name: 'カツオ', father: '波平', mother: 'フネ' },
			{ name: 'サザエ', father: '波平', mother: 'フネ' },
			{ name: 'マスオ' },
			{ name: 'タラオ', father: 'マスオ', mother: 'サザエ' },
			{ name: 'ヒトデ', father: 'マスオ', mother: 'サザエ' }
		]
	);

	const DescendantNode = relation(Family)
		.to(Family, (o) => [o.father, o.mother])
		.tree('node')
		.order((o) => [o.father]);
	const DescendantLeaf = relation(Family)
		.to(Family, (o) => [o.father, o.mother])
		.tree('leaf')
		.order((o) => [o.father]);
	const Descendants = relation(Family)
		.to(Family, (o) => [o.father, o.mother])
		.tree('all')
		.order((o) => [o.father]);
	const Children = relation(Family)
		.to(Family, (o) => [o.father, o.mother])
		.order((o) => [o.father]);
	//	const Parents = Children.back.order((o) => [o.father]);

	$: 波平 = $Family.find('波平')!;
	$: 波平children = $Children(波平);
	$: 波平grandchildren = $Children(...波平children);
	$: 波平grandgrandchildren = $Children(...波平grandchildren);
	$: 波平descendantLeaf = $DescendantLeaf(波平);
	$: 波平descendantNode = $DescendantNode(波平);
	$: 波平descendants = $Descendants(波平);
</script>

<h1>Welcome to your library project</h1>
<p>Create your package using @sveltejs/package and preview/showcase your work with SvelteKit</p>
<p>Visit <a href="https://kit.svelte.dev">kit.svelte.dev</a> to read the documentation</p>

<p>波平children : {JSON.stringify(波平children.map((o) => o.name))}</p>
<p>波平grandchildren : {JSON.stringify(波平grandchildren.map((o) => o.name))}</p>
<p>波平grandgrandchildren : {JSON.stringify(波平grandgrandchildren.map((o) => o.name))}</p>
<p>波平descendantLeaf : {JSON.stringify(波平descendantLeaf.map((o) => o.name))}</p>
<p>波平descendantNode : {JSON.stringify(波平descendantNode.map((o) => o.name))}</p>
<p>波平descendants : {JSON.stringify(波平descendants.map((o) => o.name))}</p>
